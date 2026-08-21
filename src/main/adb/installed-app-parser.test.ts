import assert from "node:assert/strict";
import test from "node:test";

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
  const headerSize = 36;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0x0102, 0);
  header.writeUInt16LE(headerSize, 2);
  header.writeUInt32LE(headerSize + attributes.length * 20, 4);
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

test("parseManifest extracts application label and icon path", () => {
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
  const manifest = Buffer.concat([
    Buffer.from([0x03, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00]),
    stringPoolChunk,
    resourceMapChunk,
    applicationChunk,
  ]);
  manifest.writeUInt32LE(manifest.length, 4);

  const result = parseManifest(manifest, undefined);
  assert.deepEqual(result, {
    name: "Test App",
    iconPath: "res/icon.png",
  });
});
