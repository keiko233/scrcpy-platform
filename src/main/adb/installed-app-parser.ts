import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AdmZip from "adm-zip";
import type { InstalledAppDto } from "../../shared/device-contracts";

const ANDROID_RESOURCES_ARSC = "resources.arsc";
const ANDROID_MANIFEST = "AndroidManifest.xml";
const DEFAULT_ICON_DENSITY = 160;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface StringPool {
  strings: string[];
}

interface ResourceMap {
  ids: number[];
}

interface ResourceTable {
  values: Map<number, string>;
}

interface PackageRecord {
  packageName: string;
  apkPath: string;
  system: boolean;
}

export async function readInstalledApp(
  record: PackageRecord,
  apk: Uint8Array,
  iconDirectory: string,
): Promise<InstalledAppDto> {
  const tempRoot = await mkdtemp(join(tmpdir(), "android-platform-app-"));
  const apkPath = join(tempRoot, "package.apk");
  await writeFile(apkPath, apk);
  try {
    const zip = new AdmZip(apkPath);
    const manifestEntry = zip.getEntry(ANDROID_MANIFEST);
    const arscEntry = zip.getEntry(ANDROID_RESOURCES_ARSC);
    const metadata = manifestEntry
      ? parseManifest(manifestEntry.getData(), arscEntry?.getData())
      : {};
    const name = metadata.name?.trim() || record.packageName;
    const icon = metadata.iconPath !== undefined
      ? await writeIcon(zip, metadata.iconPath, record.packageName, iconDirectory)
      : null;
    return {
      packageName: record.packageName,
      name,
      iconUrl: icon === null ? null : `android-platform-file://${encodeURIComponent(icon)}`,
      system: record.system,
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function writeIcon(
  zip: AdmZip,
  iconPath: string,
  packageName: string,
  iconDirectory: string,
): Promise<string | null> {
  const entry = zip.getEntry(iconPath);
  const data = entry?.getData();
  if (data === undefined || !data.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return null;
  }
  const filename = `${sanitizeFilename(packageName)}.png`;
  const target = join(iconDirectory, filename);
  await writeFile(target, data);
  return target;
}

function sanitizeFilename(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, "_");
}

export function parseManifest(
  manifest: Buffer,
  resources: Buffer | undefined,
): { name?: string; iconPath?: string } {
  const table = resources === undefined ? undefined : parseResourceTable(resources);
  let position = 8;
  const pools: StringPool[] = [];
  let resourceMap: ResourceMap | null = null;
  let name: string | undefined;
  let iconPath: string | undefined;
  let iconDensity = 0;

  while (position + 8 <= manifest.length) {
    const type = manifest.readUInt16LE(position);
    const headerSize = manifest.readUInt16LE(position + 2);
    const size = manifest.readUInt32LE(position + 4);
    if (
      headerSize < 8 ||
      size < headerSize ||
      size === 0 ||
      position + size > manifest.length
    ) {
      break;
    }

    if (type === 0x0001) {
      pools.push(parseStringPool(manifest, position, size));
    } else if (type === 0x0180) {
      resourceMap = parseResourceMap(manifest, position, headerSize, size);
    } else if (type === 0x0102 && pools.length > 0 && resourceMap !== null) {
      const elementName = stringAt(pools[0], manifest.readUInt32LE(position + 20));
      if (elementName === "application") {
        const attributeCount = manifest.readUInt16LE(position + 28);
        let attributeOffset = position + headerSize;
        for (let index = 0; index < attributeCount; index += 1) {
          const attributeNameIndex = manifest.readUInt32LE(attributeOffset + 4);
          const resourceId = resourceMap.ids[attributeNameIndex];
          const attributeName = attributeNameFromResourceId(resourceId);
          const rawValueIndex = manifest.readUInt32LE(attributeOffset + 8);
          const dataType = manifest.readUInt8(attributeOffset + 15);
          const data = manifest.readUInt32LE(attributeOffset + 16);
          const rawValue = rawValueIndex === 0xffffffff
            ? undefined
            : stringAt(pools[0], rawValueIndex);
          if (attributeName === "label" && name === undefined) {
            name = resolveValue(rawValue, dataType, data, table);
          } else if (attributeName === "icon") {
            const resolved = resolveValue(rawValue, dataType, data, table);
            if (resolved !== undefined) {
              if (dataType === 0x03 && resolved.endsWith(".png")) {
                iconPath = normalizeResourcePath(resolved);
                iconDensity = DEFAULT_ICON_DENSITY;
              } else {
                const candidate = resolveResourcePath(data, table);
                if (candidate !== undefined && candidate.density >= iconDensity) {
                  iconPath = normalizeResourcePath(candidate.path);
                  iconDensity = candidate.density;
                }
              }
            }
          }
          attributeOffset += 20;
        }
      }
    }

    position += size;
  }

  return { name, iconPath };
}

function parseStringPool(
  buffer: Buffer,
  position: number,
  size: number,
): StringPool {
  const stringCount = buffer.readUInt32LE(position + 8);
  const flags = buffer.readUInt32LE(position + 16);
  const stringsStart = buffer.readUInt32LE(position + 20);
  const utf8 = (flags & 0x100) !== 0;
  const offsetsPosition = position + 28;
  const strings: string[] = [];

  for (let index = 0; index < stringCount; index += 1) {
    const relativeOffset = buffer.readUInt32LE(offsetsPosition + index * 4);
    const stringPosition = position + stringsStart + relativeOffset;
    if (stringPosition >= position + size) {
      strings.push("");
      continue;
    }
    strings.push(
      utf8
        ? readUtf8String(buffer, stringPosition)
        : readUtf16String(buffer, stringPosition),
    );
  }
  return { strings };
}

function readUtf8String(buffer: Buffer, position: number): string {
  let cursor = position;
  cursor += cursor < buffer.length && (buffer[cursor] & 0x80) !== 0 ? 2 : 1;
  const byteLength = cursor < buffer.length && (buffer[cursor] & 0x80) !== 0
    ? buffer.readUInt16BE(cursor) & 0x7fff
    : buffer[cursor];
  cursor += cursor < buffer.length && (buffer[cursor] & 0x80) !== 0 ? 2 : 1;
  return buffer.toString("utf8", cursor, cursor + byteLength);
}

function readUtf16String(buffer: Buffer, position: number): string {
  let cursor = position;
  const characterLength = cursor < buffer.length && (buffer[cursor] & 0x80) !== 0
    ? buffer.readUInt16LE(cursor) & 0x7fff
    : buffer.readUInt16LE(cursor);
  cursor += cursor < buffer.length && (buffer[cursor] & 0x80) !== 0 ? 4 : 2;
  return buffer.toString("utf16le", cursor, cursor + characterLength * 2);
}

function parseResourceMap(
  buffer: Buffer,
  position: number,
  headerSize: number,
  size: number,
): ResourceMap {
  const ids: number[] = [];
  for (let offset = position + headerSize; offset + 4 <= position + size; offset += 4) {
    ids.push(buffer.readUInt32LE(offset));
  }
  return { ids };
}

function parseResourceTable(buffer: Buffer): ResourceTable | undefined {
  try {
    const packageCount = buffer.readUInt32LE(8);
    let position = buffer.readUInt32LE(4);
    const table: ResourceTable = {
      values: new Map(),
    };
    for (let index = 0; index < packageCount && position < buffer.length; index += 1) {
      const packagePosition = position;
      const packageSize = buffer.readUInt32LE(packagePosition + 4);
      const packageId = buffer.readUInt32LE(packagePosition + 8);
      const typeStringsOffset = buffer.readUInt32LE(packagePosition + 268);
      const keyStringsOffset = buffer.readUInt32LE(packagePosition + 276);
      let chunkPosition = packagePosition + typeStringsOffset;
      const typeStringsEnd = packagePosition + keyStringsOffset;
      const typePools = new Map<number, StringPool>();
      let typeIndex = 1;
      while (chunkPosition + 8 < typeStringsEnd) {
        const type = buffer.readUInt16LE(chunkPosition);
        const size = buffer.readUInt32LE(chunkPosition + 4);
        if (type === 0x0001) {
          typePools.set(typeIndex, parseStringPool(buffer, chunkPosition, size));
        }
        chunkPosition += size;
        typeIndex += 1;
      }
      chunkPosition = packagePosition + keyStringsOffset;
      while (chunkPosition + 8 < packagePosition + packageSize) {
        const type = buffer.readUInt16LE(chunkPosition);
        const size = buffer.readUInt32LE(chunkPosition + 4);
        if (type === 0x0201) {
          const typeId = buffer.readUInt8(chunkPosition + 8) & 0xff;
          const entryCount = buffer.readUInt32LE(chunkPosition + 12);
          const entriesStart = buffer.readUInt32LE(chunkPosition + 16);
          const offsetsPosition = chunkPosition + 20;
          const pool = typePools.get(typeId);
          for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
            const entryOffset = buffer.readUInt32LE(offsetsPosition + entryIndex * 4);
            if (entryOffset === 0xffffffff || pool === undefined) {
              continue;
            }
            const entryPosition = chunkPosition + entriesStart + entryOffset;
            const valuePosition = entryPosition + 8;
            if (valuePosition + 8 > chunkPosition + size) {
              continue;
            }
            const dataType = buffer.readUInt8(valuePosition + 3);
            const data = buffer.readUInt32LE(valuePosition + 4);
            if (dataType !== 0x03) {
              continue;
            }
            const value = stringAt(pool, data);
            if (value !== undefined && value.length > 0) {
              const key = packageId * 0x1000000 + typeId * 0x10000 + entryIndex;
              table.values.set(key, value);
            }
          }
        }
        chunkPosition += size;
      }
      position = packagePosition + packageSize;
    }
    return table;
  } catch {
    return undefined;
  }
}

function resolveValue(
  rawValue: string | undefined,
  dataType: number,
  data: number,
  table: ResourceTable | undefined,
): string | undefined {
  if (dataType === 0x03 && rawValue !== undefined) {
    return rawValue;
  }
  if (dataType === 0x01) {
    return resolveResourcePath(data, table)?.path;
  }
  return rawValue;
}

function resolveResourcePath(
  resourceId: number,
  table: ResourceTable | undefined,
): { path: string; density: number } | undefined {
  if (table === undefined) {
    return undefined;
  }
  const path = table.values.get(resourceId);
  if (path === undefined) {
    return undefined;
  }
  return { path, density: densityFromPath(path) };
}

function densityFromPath(path: string): number {
  const density = /(?:^|\/)(?:drawable|mipmap)-[a-z]*?(?:hdpi|xhdpi|xxhdpi|xxxhdpi|ldpi|mdpi)/.exec(path);
  if (density === null) {
    const exact = /(?:^|\/)(?:drawable|mipmap)-(?:|.*-)(\d+)dpi(?:-|$)/.exec(path);
    return exact === null ? DEFAULT_ICON_DENSITY : Number(exact[1]);
  }
  const marker = density[0];
  if (marker.includes("xxxhdpi")) return 640;
  if (marker.includes("xxhdpi")) return 480;
  if (marker.includes("xhdpi")) return 320;
  if (marker.includes("hdpi")) return 240;
  if (marker.includes("mdpi")) return 160;
  if (marker.includes("ldpi")) return 120;
  return DEFAULT_ICON_DENSITY;
}

function normalizeResourcePath(path: string): string | undefined {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  return normalized.includes("..") || normalized.startsWith("/") ? undefined : normalized;
}

function attributeNameFromResourceId(resourceId: number | undefined): string | undefined {
  switch (resourceId) {
    case 0x01010001:
      return "label";
    case 0x01010002:
      return "icon";
    default:
      return undefined;
  }
}

function stringAt(pool: StringPool, index: number): string | undefined {
  return index === 0xffffffff ? undefined : pool.strings[index];
}
