import { inflateRawSync } from "node:zlib";
import type { Adb } from "@yume-chan/adb";

/**
 * Reads selected entries out of an APK stored on a device without pulling the
 * whole file. Only the end-of-central-directory tail, the central directory,
 * and the requested entry bytes are transferred over ADB.
 */

export interface ApkEntryInfo {
  /** Entry name, e.g. `AndroidManifest.xml` or `res/mipmap-hdpi/ic_launcher.webp` */
  name: string;
  /** 0 = stored, 8 = deflate */
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;

const DD_BLOCK = 65536;
const MAX_EOCD_TAIL = 128 * 1024;
const MAX_ENTRY_BYTES = 24 * 1024 * 1024;

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

/**
 * Reads `length` bytes starting at `start` from a file on the device.
 * Uses `dd` with a block size so the seek is fast even for large APKs.
 */
export async function readFileRange(
  adb: Adb,
  path: string,
  start: number,
  length: number,
): Promise<Buffer> {
  if (length <= 0) {
    return Buffer.alloc(0);
  }
  const skipBlocks = Math.floor(start / DD_BLOCK);
  const end = start + length;
  const totalBlocks = Math.ceil(end / DD_BLOCK);
  const count = totalBlocks - skipBlocks;
  const raw = await adb.subprocess.noneProtocol.spawnWait([
    "dd",
    `if=${shellQuote(path)}`,
    `bs=${DD_BLOCK}`,
    `skip=${skipBlocks}`,
    `count=${count}`,
    "2>/dev/null",
  ]);
  const buffer = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
  const offset = start - skipBlocks * DD_BLOCK;
  if (offset + length > buffer.length) {
    throw new Error(`Short read from ${path}`);
  }
  return buffer.subarray(offset, offset + length);
}

async function fileSize(adb: Adb, path: string): Promise<number> {
  const sync = await adb.sync();
  try {
    const stat = await sync.stat(path);
    return Number(stat.size);
  } finally {
    await sync.dispose();
  }
}

export class ApkEntryReader {
  readonly #adb: Adb;
  readonly #path: string;
  #entries: Promise<ApkEntryInfo[]> | null = null;

  constructor(adb: Adb, path: string) {
    this.#adb = adb;
    this.#path = path;
  }

  entries(): Promise<ApkEntryInfo[]> {
    this.#entries ??= this.#readEntries();
    return this.#entries;
  }

  async readEntry(entry: ApkEntryInfo): Promise<Buffer> {
    if (entry.compressedSize > MAX_ENTRY_BYTES) {
      throw new Error(`APK entry too large: ${entry.name}`);
    }
    const header = await readFileRange(
      this.#adb,
      this.#path,
      entry.localHeaderOffset,
      30,
    );
    const nameLength = header.readUInt16LE(26);
    const extraLength = header.readUInt16LE(28);
    const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength;
    const data = await readFileRange(
      this.#adb,
      this.#path,
      dataStart,
      entry.compressedSize,
    );
    if (entry.compressionMethod === 0) {
      return data;
    }
    if (entry.compressionMethod === 8) {
      return inflateRawSync(data);
    }
    throw new Error(`Unsupported APK compression method ${entry.compressionMethod}`);
  }

  async readEntries(names: ReadonlySet<string>): Promise<Map<string, Buffer>> {
    const wanted = new Map<string, ApkEntryInfo>();
    for (const entry of await this.entries()) {
      if (names.has(entry.name)) {
        wanted.set(entry.name, entry);
      }
    }
    const result = new Map<string, Buffer>();
    for (const [name, entry] of wanted) {
      result.set(name, await this.readEntry(entry));
    }
    return result;
  }

  async #readEntries(): Promise<ApkEntryInfo[]> {
    const size = await fileSize(this.#adb, this.#path);
    const tailLength = Math.min(size, MAX_EOCD_TAIL);
    const tail = await readFileRange(this.#adb, this.#path, size - tailLength, tailLength);
    const eocd = findEndOfCentralDirectory(tail);
    const centralDirectory = await readFileRange(
      this.#adb,
      this.#path,
      eocd.offset,
      eocd.size,
    );
    return parseCentralDirectory(centralDirectory);
  }
}

function findEndOfCentralDirectory(tail: Buffer): { offset: number; size: number } {
  for (let position = tail.length - 22; position >= 0; position -= 1) {
    if (tail.readUInt32LE(position) !== EOCD_SIGNATURE) {
      continue;
    }
    const commentLength = tail.readUInt16LE(position + 20);
    if (position + 22 + commentLength > tail.length) {
      continue;
    }
    const size = tail.readUInt32LE(position + 12);
    const offset = tail.readUInt32LE(position + 16);
    if (size === 0xffffffff || offset === 0xffffffff) {
      throw new Error("ZIP64 archives are not supported");
    }
    return { offset, size };
  }
  throw new Error("End of central directory not found");
}

function parseCentralDirectory(buffer: Buffer): ApkEntryInfo[] {
  const entries: ApkEntryInfo[] = [];
  let position = 0;
  while (position + 46 <= buffer.length) {
    if (buffer.readUInt32LE(position) !== CENTRAL_DIRECTORY_SIGNATURE) {
      break;
    }
    const nameLength = buffer.readUInt16LE(position + 28);
    const extraLength = buffer.readUInt16LE(position + 30);
    const commentLength = buffer.readUInt16LE(position + 32);
    const nameEnd = position + 46 + nameLength;
    if (nameEnd + extraLength + commentLength > buffer.length) {
      break;
    }
    entries.push({
      name: buffer.toString("utf8", position + 46, nameEnd),
      compressionMethod: buffer.readUInt16LE(position + 10),
      compressedSize: buffer.readUInt32LE(position + 20),
      localHeaderOffset: buffer.readUInt32LE(position + 42),
    });
    position = nameEnd + extraLength + commentLength;
  }
  return entries;
}