import { assert, test } from "vitest";

import { parseManifest } from "./installed-app-parser";

function chunk(type: number, headerSize: number, body: Buffer): Buffer {
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(type, 0);
  header.writeUInt16LE(headerSize, 2);
  header.writeUInt32LE(headerSize + body.length, 4);
  return Buffer.concat([header, body]);
}

function stringPool(strings: string[]): Buffer {
  const offsets: number[] = [];
  const encodedStrings: Buffer[] = [];
  let offset = 0;
  for (const value of strings) {
    offsets.push(offset);
    const encoded = Buffer.from(value, "utf16le");
    const entry = Buffer.alloc(2 + encoded.length + 2);
    entry.writeUInt16LE(value.length, 0);
    encoded.copy(entry, 2);
    encodedStrings.push(entry);
    offset += entry.length;
  }
  const header = Buffer.alloc(28);
  header.writeUInt16LE(0x0001, 0);
  header.writeUInt16LE(28, 2);
  header.writeUInt32LE(28 + strings.length * 4 + offset, 4);
  header.writeUInt32LE(strings.length, 8);
  header.writeUInt32LE(0, 12);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(28 + strings.length * 4, 20);
  header.writeUInt32LE(0, 24);
  const offsetTable = Buffer.alloc(strings.length * 4);
  offsets.forEach((value, index) => {
    offsetTable.writeUInt32LE(value, index * 4);
  });
  return Buffer.concat([header, offsetTable, ...encodedStrings]);
}

function startElementChunk(
  nameIndex: number,
  attributes: Array<{ nameIndex: number; rawValueIndex: number }>,
): Buffer {
  const nodeHeaderSize = 16;
  const extSize = 20;
  const header = Buffer.alloc(nodeHeaderSize + extSize);
  header.writeUInt16LE(0x0102, 0);
  header.writeUInt16LE(nodeHeaderSize, 2);
  header.writeUInt32LE(header.length + attributes.length * 20, 4);
  header.writeUInt32LE(0xffffffff, 16);
  header.writeUInt32LE(nameIndex, 20);
  header.writeUInt16LE(20, 24);
  header.writeUInt16LE(20, 26);
  header.writeUInt16LE(attributes.length, 28);

  const attributeData = Buffer.alloc(attributes.length * 20);
  attributes.forEach((attribute, index) => {
    const offset = index * 20;
    attributeData.writeUInt32LE(0xffffffff, offset);
    attributeData.writeUInt32LE(attribute.nameIndex, offset + 4);
    attributeData.writeUInt32LE(attribute.rawValueIndex, offset + 8);
    attributeData.writeUInt16LE(8, offset + 12);
    attributeData.writeUInt8(0x03, offset + 15);
    attributeData.writeUInt32LE(attribute.rawValueIndex, offset + 16);
  });
  return Buffer.concat([header, attributeData]);
}

function startElementChunkWithValues(
  nameIndex: number,
  attributes: Array<{
    nameIndex: number;
    rawValueIndex: number;
    dataType: number;
    data: number;
  }>,
): Buffer {
  const nodeHeaderSize = 16;
  const extSize = 20;
  const header = Buffer.alloc(nodeHeaderSize + extSize);
  header.writeUInt16LE(0x0102, 0);
  header.writeUInt16LE(nodeHeaderSize, 2);
  header.writeUInt32LE(header.length + attributes.length * 20, 4);
  header.writeUInt32LE(0xffffffff, 16);
  header.writeUInt32LE(nameIndex, 20);
  header.writeUInt16LE(20, 24);
  header.writeUInt16LE(20, 26);
  header.writeUInt16LE(attributes.length, 28);

  const attributeData = Buffer.alloc(attributes.length * 20);
  attributes.forEach((attribute, index) => {
    const offset = index * 20;
    attributeData.writeUInt32LE(0xffffffff, offset);
    attributeData.writeUInt32LE(attribute.nameIndex, offset + 4);
    attributeData.writeUInt32LE(attribute.rawValueIndex, offset + 8);
    attributeData.writeUInt16LE(8, offset + 12);
    attributeData.writeUInt8(attribute.dataType, offset + 15);
    attributeData.writeUInt32LE(attribute.data, offset + 16);
  });
  return Buffer.concat([header, attributeData]);
}

interface TypeChunkEntry {
  key: number;
  dataType: number;
  data: number;
}

function typeChunk(typeId: number, entries: TypeChunkEntry[]): Buffer {
  const headerSize = 20;
  const entryCount = entries.length;
  const entriesStart = headerSize + entryCount * 4;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0x0201, 0);
  header.writeUInt16LE(headerSize, 2);
  header.writeUInt8(typeId, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt32LE(entryCount, 12);
  header.writeUInt32LE(entriesStart, 16);
  const offsets = Buffer.alloc(entryCount * 4);
  entries.forEach((_, index) => {
    offsets.writeUInt32LE(index * 16, index * 4);
  });
  const entryBuffers: Buffer[] = [];
  entries.forEach((entry) => {
    const entryBuffer = Buffer.alloc(16);
    entryBuffer.writeUInt16LE(8, 0);
    entryBuffer.writeUInt16LE(0, 2);
    entryBuffer.writeUInt32LE(entry.key, 4);
    entryBuffer.writeUInt16LE(8, 8);
    entryBuffer.writeUInt8(0, 10);
    entryBuffer.writeUInt8(entry.dataType, 11);
    entryBuffer.writeUInt32LE(entry.data, 12);
    entryBuffers.push(entryBuffer);
  });
  const body = Buffer.concat([offsets, ...entryBuffers]);
  const full = Buffer.concat([header, body]);
  full.writeUInt32LE(headerSize + body.length, 4);
  return full;
}

function resourceTable(
  typeNames: string[],
  keyNames: string[],
  typeChunks: Buffer[],
): Buffer {
  const headerSize = 12;
  const packageHeaderSize = 288;
  const typePool = stringPool(typeNames);
  const keyPool = stringPool(keyNames);
  const typeStringsOffset = packageHeaderSize;
  const keyStringsOffset = typeStringsOffset + typePool.length;
  const chunks = Buffer.concat(typeChunks);
  const packageSize = keyStringsOffset + keyPool.length + chunks.length;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0x0002, 0);
  header.writeUInt16LE(headerSize, 2);
  header.writeUInt32LE(headerSize + packageSize, 4);
  header.writeUInt32LE(1, 8);

  const packageHeader = Buffer.alloc(packageHeaderSize);
  packageHeader.writeUInt16LE(0x0200, 0);
  packageHeader.writeUInt16LE(packageHeaderSize, 2);
  packageHeader.writeUInt32LE(packageSize, 4);
  packageHeader.writeUInt32LE(0x7f, 8);
  packageHeader.writeUInt32LE(typeStringsOffset, 268);
  packageHeader.writeUInt32LE(0, 272);
  packageHeader.writeUInt32LE(keyStringsOffset, 276);
  packageHeader.writeUInt32LE(0, 280);
  packageHeader.writeUInt32LE(0, 284);

  return Buffer.concat([header, packageHeader, typePool, keyPool, chunks]);
}

function manifestWith(
  applicationChunk: Buffer,
  resourceMapChunk: Buffer,
  stringPoolChunk: Buffer,
): Buffer {
  const manifest = Buffer.concat([
    Buffer.from([0x03, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00]),
    stringPoolChunk,
    resourceMapChunk,
    applicationChunk,
  ]);
  manifest.writeUInt32LE(manifest.length, 4);
  return manifest;
}

test("parseManifest extracts the application label", () => {
  const stringPoolChunk = stringPool([
    "application",
    "Test App",
    "res/icon.png",
    "label",
    "icon",
  ]);
  const resourceMapBody = Buffer.alloc(20);
  resourceMapBody.writeUInt32LE(0x01010001, 12);
  resourceMapBody.writeUInt32LE(0x01010002, 16);
  const resourceMapChunk = chunk(0x0180, 8, resourceMapBody);
  const applicationChunk = startElementChunk(0, [
    { nameIndex: 3, rawValueIndex: 1 },
    { nameIndex: 4, rawValueIndex: 2 },
  ]);
  const manifest = manifestWith(applicationChunk, resourceMapChunk, stringPoolChunk);

  const result = parseManifest(manifest, undefined);
  assert.deepEqual(result, {
    name: "Test App",
  });
});

test("parseManifest resolves a string resource reference", () => {
  const typeNames = Array.from({ length: 21 }, () => "");
  typeNames[17] = "mipmap";
  typeNames[20] = "string";
  const keyNames = ["app_name", "My Test App", "ic_launcher"];
  const stringType = typeChunk(0x14, [
    { key: 0, dataType: 0x03, data: 1 },
  ]);
  const mipmapType = typeChunk(0x11, [
    { key: 0, dataType: 0x01, data: 0 },
    { key: 1, dataType: 0x01, data: 0 },
    { key: 2, dataType: 0x01, data: 0 },
  ]);
  const arsc = resourceTable(typeNames, keyNames, [stringType, mipmapType]);

  const stringPoolChunk = stringPool(["application", "label", "icon"]);
  const resourceMapBody = Buffer.alloc(12);
  resourceMapBody.writeUInt32LE(0x01010001, 4);
  resourceMapBody.writeUInt32LE(0x01010002, 8);
  const resourceMapChunk = chunk(0x0180, 8, resourceMapBody);
  const applicationChunk = startElementChunkWithValues(0, [
    { nameIndex: 1, rawValueIndex: 0xffffffff, dataType: 0x01, data: 0x7f140000 },
    { nameIndex: 2, rawValueIndex: 0xffffffff, dataType: 0x01, data: 0x7f110002 },
  ]);
  const manifest = manifestWith(applicationChunk, resourceMapChunk, stringPoolChunk);

  const result = parseManifest(manifest, arsc);
  assert.deepEqual(result, {
    name: "My Test App",
  });
});
