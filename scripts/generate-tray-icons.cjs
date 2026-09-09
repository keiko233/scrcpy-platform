#!/usr/bin/env node
/**
 * Generates the system tray icon PNGs committed under src/main/tray/assets.
 *
 * Draws a lightning bolt (matching the app's favicon motif) with a
 * point-in-polygon fill, supersampled for anti-aliasing:
 *   - tray-template.png / tray-template@2x.png: black + alpha, macOS menu bar
 *     template images (Electron marks them as templates).
 *   - tray-icon.png / tray-icon@2x.png: brand purple, Windows tray area.
 *
 * Re-run with `node scripts/generate-tray-icons.cjs` after editing the glyph.
 */
"use strict";

const { deflateSync } = require("node:zlib");
const { mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const BRAND_RGB = [0x86, 0x3b, 0xff]; // #863bff from public/favicon.svg
const OUTPUT_DIR = join(__dirname, "..", "src", "main", "tray", "assets");

// Lightning bolt polygon in a 24x24 unit grid (lucide "zap" silhouette,
// y grows downward).
const BOLT = [
  [13, 2],
  [3, 14],
  [12, 14],
  [11, 22],
  [21, 10],
  [12, 10],
];

const SAMPLES = 3; // supersampling factor per pixel at 32px

function scalePoints(size) {
  const minX = Math.min(...BOLT.map(([x]) => x));
  const maxX = Math.max(...BOLT.map(([x]) => x));
  const minY = Math.min(...BOLT.map(([, y]) => y));
  const maxY = Math.max(...BOLT.map(([, y]) => y));
  const margin = size * 0.0625; // ~2px on a 32px canvas
  const scale = (size - margin * 2) / Math.max(maxX - minX, maxY - minY);
  const offsetX = (size - (maxX - minX) * scale) / 2;
  const offsetY = (size - (maxY - minY) * scale) / 2;
  return BOLT.map(([x, y]) => [
    (x - minX) * scale + offsetX,
    (y - minY) * scale + offsetY,
  ]);
}

function inside(polygon, x, y) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const crosses = yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) {
      inside = !inside;
    }
  }
  return inside;
}

/** Renders a size x size RGBA bitmap (Uint8ClampedArray) of the bolt. */
function render(size, rgb) {
  const polygon = scalePoints(size);
  const pixels = new Uint8ClampedArray(size * size * 4);
  const step = 1 / SAMPLES;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let hits = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = px + (sx + 0.5) * step;
          const y = py + (sy + 0.5) * step;
          if (inside(polygon, x, y)) {
            hits++;
          }
        }
      }
      const alpha = Math.round((hits / (SAMPLES * SAMPLES)) * 255);
      const index = (py * size + px) * 4;
      pixels[index] = rgb[0];
      pixels[index + 1] = rgb[1];
      pixels[index + 2] = rgb[2];
      pixels[index + 3] = alpha;
    }
  }
  return pixels;
}

/** Box-filters a 32px RGBA bitmap down to 16px (premultiplied averaging). */
function downsample(source) {
  const size = 16;
  const out = new Uint8ClampedArray(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let alpha = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const index = ((py * 2 + dy) * size * 2 + (px * 2 + dx)) * 4;
          const a = source[index + 3];
          alpha += a;
          r += (source[index] * a) / 255;
          g += (source[index + 1] * a) / 255;
          b += (source[index + 2] * a) / 255;
        }
      }
      const index = (py * size + px) * 4;
      out[index + 3] = Math.round(alpha / 4);
      if (alpha > 0) {
        out[index] = Math.round(r / alpha * 255);
        out[index + 1] = Math.round(g / alpha * 255);
        out[index + 2] = Math.round(b / alpha * 255);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Minimal PNG encoder (8-bit RGBA, no interlace).
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(pixels, size) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // color type RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    rows[y * (size * 4 + 1)] = 0; // filter: none
    rows.set(
      pixels.subarray(y * size * 4, (y + 1) * size * 4),
      y * (size * 4 + 1) + 1,
    );
  }
  return Buffer.concat([
    signature,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function writePng(name, pixels, size) {
  writeFileSync(join(OUTPUT_DIR, name), encodePng(pixels, size));
  console.log(`wrote ${name} (${size}x${size})`);
}

mkdirSync(OUTPUT_DIR, { recursive: true });
const black = [0, 0, 0];
const template32 = render(32, black);
const color32 = render(32, BRAND_RGB);
writePng("tray-template@2x.png", template32, 32);
writePng("tray-template.png", downsample(template32), 16);
writePng("tray-icon@2x.png", color32, 32);
writePng("tray-icon.png", downsample(color32), 16);
