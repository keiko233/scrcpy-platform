import type { Adb } from "@yume-chan/adb";
import type { InstalledAppDto } from "../../shared/device-contracts";
import { FilePath } from "../../shared/constants/app";
import { ApkEntryReader } from "./apk-reader";

const ANDROID_RESOURCES_ARSC = FilePath.ANDROID_RESOURCES_ARSC;
const ANDROID_MANIFEST = FilePath.ANDROID_MANIFEST;
const MAX_RESOURCES_BYTES = 24 * 1024 * 1024;

interface StringPool {
  strings: string[];
}

interface ResourceTable {
  values: Map<number, string>;
  typeNames: string[];
}

export interface PackageRecord {
  packageName: string;
  apkPath: string;
  system: boolean;
}

export interface ManifestMetadata {
  name?: string;
}

export async function readInstalledApp(
  adb: Adb,
  record: PackageRecord,
): Promise<InstalledAppDto> {
  const reader = new ApkEntryReader(adb, record.apkPath);
  const entries = await reader.entries();
  const byName = new Map(entries.map((entry) => [entry.name, entry]));

  let manifestBuffer: Buffer | undefined;
  const manifestEntry = byName.get(ANDROID_MANIFEST);
  if (manifestEntry !== undefined) {
    manifestBuffer = await reader.readEntry(manifestEntry);
  }

  let resourcesBuffer: Buffer | undefined;
  const resourcesEntry = byName.get(ANDROID_RESOURCES_ARSC);
  if (
    resourcesEntry !== undefined &&
    resourcesEntry.compressedSize <= MAX_RESOURCES_BYTES
  ) {
    resourcesBuffer = await reader.readEntry(resourcesEntry);
  }

  const metadata = manifestBuffer === undefined
    ? {}
    : parseManifest(manifestBuffer, resourcesBuffer);
  const name = metadata.name?.trim() || record.packageName;

  return {
    packageName: record.packageName,
    name,
    system: record.system,
  };
}

export function parseManifest(
  manifest: Buffer,
  resources: Buffer | undefined,
): ManifestMetadata {
  const table = resources === undefined ? undefined : parseResourceTable(resources);
  let position = 8;
  const pools: StringPool[] = [];
  let resourceMap: ResourceMap | null = null;
  let name: string | undefined;

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
        const attributeStart = manifest.readUInt16LE(position + 24);
        const attributeSize = manifest.readUInt16LE(position + 26);
        let attributeOffset = position + headerSize + attributeStart;
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
          }
          attributeOffset += attributeSize;
        }
      }
    }

    position += size;
  }

  return { name };
}

function parseResourceTable(buffer: Buffer): ResourceTable | undefined {
  try {
    const packageCount = buffer.readUInt32LE(8);
    let position = buffer.readUInt16LE(2);
    if (position < 12 || position >= buffer.length) {
      return undefined;
    }
    const table: ResourceTable = {
      values: new Map(),
      typeNames: [],
    };
    let valuePool: StringPool | undefined;
    let parsedPackages = 0;
    while (position + 8 <= buffer.length && parsedPackages < packageCount) {
      const type = buffer.readUInt16LE(position);
      const size = buffer.readUInt32LE(position + 4);
      if (size < 8 || position + size > buffer.length) {
        break;
      }
      if (type === 0x0001 && valuePool === undefined) {
        valuePool = parseStringPool(buffer, position, size);
      }
      if (type === 0x0200) {
        const packagePosition = position;
        const packageId = buffer.readUInt32LE(packagePosition + 8);
        const typeStringsOffset = buffer.readUInt32LE(packagePosition + 268);
        const keyStringsOffset = buffer.readUInt32LE(packagePosition + 276);
        const typePool = parsePoolAt(buffer, packagePosition + typeStringsOffset);
        const keyPool = parsePoolAt(buffer, packagePosition + keyStringsOffset);
        if (typePool !== undefined) {
          table.typeNames = typePool.strings;
        }
        let chunkPosition = packagePosition + keyStringsOffset;
        while (chunkPosition + 8 < packagePosition + size) {
          const chunkType = buffer.readUInt16LE(chunkPosition);
          const chunkSize = buffer.readUInt32LE(chunkPosition + 4);
          if (chunkSize < 8 || chunkPosition + chunkSize > packagePosition + size) {
            break;
          }
          if (chunkType === 0x0201 && keyPool !== undefined) {
            try {
              parseTypeChunk(buffer, table, keyPool, valuePool, packageId, chunkPosition, chunkSize);
            } catch {
              // Skip malformed or truncated type chunks; earlier chunks stay valid.
            }
          }
          chunkPosition += chunkSize;
        }
        parsedPackages += 1;
      }
      position += size;
    }
    return table;
  } catch {
    return undefined;
  }
}

function parseTypeChunk(
  buffer: Buffer,
  table: ResourceTable,
  keyPool: StringPool,
  valuePool: StringPool | undefined,
  packageId: number,
  chunkPosition: number,
  chunkSize: number,
): void {
  const typeId = buffer.readUInt8(chunkPosition + 8) & 0xff;
  const entryCount = buffer.readUInt32LE(chunkPosition + 12);
  const entriesStart = buffer.readUInt32LE(chunkPosition + 16);
  const chunkHeaderSize = buffer.readUInt16LE(chunkPosition + 2);
  const sparse = (buffer.readUInt8(chunkPosition + 9) & 0x01) !== 0;
  const offsetsPosition = chunkPosition + chunkHeaderSize;
  const chunkEnd = chunkPosition + chunkSize;
  if (sparse) {
    for (let index = 0; index < entryCount; index += 1) {
      if (offsetsPosition + index * 4 + 4 > chunkEnd) {
        break;
      }
      const entryIndex = buffer.readUInt16LE(offsetsPosition + index * 4);
      const entryOffset = buffer.readUInt16LE(offsetsPosition + index * 4 + 2);
      parseEntry(buffer, table, keyPool, valuePool, packageId, typeId, entryIndex, chunkPosition + entriesStart + entryOffset, chunkEnd);
    }
    return;
  }
  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    if (offsetsPosition + entryIndex * 4 + 4 > chunkEnd) {
      break;
    }
    const entryOffset = buffer.readUInt32LE(offsetsPosition + entryIndex * 4);
    if (entryOffset === 0xffffffff) {
      continue;
    }
    parseEntry(buffer, table, keyPool, valuePool, packageId, typeId, entryIndex, chunkPosition + entriesStart + entryOffset, chunkEnd);
  }
}

function parseEntry(
  buffer: Buffer,
  table: ResourceTable,
  keyPool: StringPool,
  valuePool: StringPool | undefined,
  packageId: number,
  typeId: number,
  entryIndex: number,
  entryPosition: number,
  chunkEnd: number,
): void {
  if (entryPosition + 16 > chunkEnd) {
    return;
  }
  const entrySize = buffer.readUInt16LE(entryPosition);
  const entryFlags = buffer.readUInt16LE(entryPosition + 2);
  if ((entryFlags & 0x0001) !== 0) {
    return;
  }
  const valuePosition = entryPosition + entrySize;
  if (valuePosition + 8 > chunkEnd) {
    return;
  }
  const dataType = buffer.readUInt8(valuePosition + 3);
  if (dataType !== 0x03) {
    return;
  }
  const data = buffer.readUInt32LE(valuePosition + 4);
  const value = (valuePool ?? keyPool) === undefined
    ? undefined
    : stringAt(valuePool ?? keyPool, data);
  if (value !== undefined && value.length > 0) {
    const key = packageId * 0x1000000 + typeId * 0x10000 + entryIndex;
    table.values.set(key, value);
  }
}

function parsePoolAt(buffer: Buffer, position: number): StringPool | undefined {
  if (position + 8 > buffer.length) {
    return undefined;
  }
  const type = buffer.readUInt16LE(position);
  if (type !== 0x0001) {
    return undefined;
  }
  const size = buffer.readUInt32LE(position + 4);
  if (size < 28 || position + size > buffer.length) {
    return undefined;
  }
  return parseStringPool(buffer, position, size);
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
  cursor += encodedLengthSize(buffer, cursor);
  const byteLength = readEncodedLength(buffer, cursor);
  cursor += encodedLengthSize(buffer, cursor);
  if (cursor >= buffer.length) {
    return "";
  }
  return buffer.toString("utf8", cursor, Math.min(cursor + byteLength, buffer.length));
}

function readUtf16String(buffer: Buffer, position: number): string {
  let cursor = position;
  const first = cursor + 2 <= buffer.length ? buffer.readUInt16LE(cursor) : 0;
  let characterLength: number;
  if ((first & 0x8000) !== 0) {
    characterLength = ((first & 0x7fff) << 16) | buffer.readUInt16LE(cursor + 2);
    cursor += 4;
  } else {
    characterLength = first;
    cursor += 2;
  }
  if (cursor >= buffer.length) {
    return "";
  }
  return buffer.toString(
    "utf16le",
    cursor,
    Math.min(cursor + characterLength * 2, buffer.length),
  );
}

function readEncodedLength(buffer: Buffer, position: number): number {
  if ((buffer[position] & 0x80) === 0) {
    return buffer[position];
  }
  return ((buffer[position] & 0x7f) << 8) | buffer[position + 1];
}

function encodedLengthSize(buffer: Buffer, position: number): number {
  return (buffer[position] & 0x80) === 0 ? 1 : 2;
}

interface ResourceMap {
  ids: number[];
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
    return table?.values.get(data);
  }
  return rawValue;
}

function attributeNameFromResourceId(resourceId: number | undefined): string | undefined {
  return resourceId === 0x01010001 ? "label" : undefined;
}

function stringAt(pool: StringPool, index: number): string | undefined {
  return index === 0xffffffff ? undefined : pool.strings[index];
}
