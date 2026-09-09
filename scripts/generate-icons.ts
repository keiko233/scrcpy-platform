/**
 * Generates the app's icon assets from a single Iconify glyph
 * (fluent:phone-desktop-32-filled, a monitor + phone pair matching the
 * scrcpy use case):
 *
 *   - public/favicon.svg          brand tile + near-white glyph (renderer tab icon)
 *   - build/icon.png              brand tile + near-white glyph, 1024x1024 (app icon
 *                                 source for electron-builder: it derives
 *                                 .icns/.ico from this on each platform build)
 *   - src/main/tray/assets/*      dark tray icon PNGs for Windows plus a
 *                                 transparent template tray-icon-macos.png /
 *                                 @2x pair for the macOS menu bar
 *
 * Re-run with `pnpm icons` after tweaking the glyph or palette.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const TILE_VIEWBOX_SIZE = 48;
const TILE_RADIUS = 10;
const GLYPH_VIEWBOX_SIZE = 32;
const GLYPH_SCALE = 0.82;
const MACOS_GLYPH_SCALE = 1;
const MACOS_GLYPH_STROKE_WIDTH = 1.25;
const PNG_SIGNATURE = Buffer.from([
  137, 80, 78, 71, 13, 10, 26, 10,
]);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TRAY_OUTPUT_DIR = join(ROOT, "src", "main", "tray", "assets");
const BUILD_OUTPUT_DIR = join(ROOT, "build");

type TilePalette = {
  gradientTop: string;
  gradientBottom: string;
  glyph: string;
  border: string;
  borderOpacity: string;
};

// The dark palette mirrors the application's dark workbench and is used by
// the app icon, favicon and Windows tray.
const DARK_PALETTE: TilePalette = {
  gradientTop: "#3a3a3a",
  gradientBottom: "#111111",
  glyph: "#f4f4f5",
  border: "#ffffff",
  borderOpacity: "0.14",
};

// Iconify: fluent:phone-desktop-32-filled
// Source: https://icon-sets.iconify.design/fluent/phone-desktop-32-filled/
// Author: Microsoft Corporation; license: MIT.
// The path is kept as a single filled glyph so it remains legible at 16px.
const GLYPH = `<path fill="currentColor" d="M5 5.25A3.25 3.25 0 0 1 8.25 2h18.5A3.25 3.25 0 0 1 30 5.25v12.5A3.25 3.25 0 0 1 26.75 21H22v3h2a1 1 0 1 1 0 2h-9.5v-2H20v-3h-5.5v-5.75a4.75 4.75 0 0 0-4.75-4.75h-4.5a5 5 0 0 0-.25.007zm-3 10A3.25 3.25 0 0 1 5.25 12h4.5A3.25 3.25 0 0 1 13 15.25v11.5A3.25 3.25 0 0 1 9.75 30h-4.5A3.25 3.25 0 0 1 2 26.75zM6 26a1 1 0 0 0 1 1h1a1 1 0 1 0 0-2H7a1 1 0 0 0-1 1"/>`;

// Iconify: fluent:phone-desktop-32-regular
// Source: https://icon-sets.iconify.design/fluent/phone-desktop-32-regular/
// Author: Microsoft Corporation; license: MIT.
// This outline glyph is rendered on transparency and marked as a macOS
// template image by TrayManager, so macOS supplies the menu-bar-appropriate
// foreground color.
const MACOS_TEMPLATE_GLYPH = `<path fill="currentColor" stroke="currentColor" stroke-linejoin="round" stroke-width="${MACOS_GLYPH_STROKE_WIDTH}" d="M8.25 2A3.25 3.25 0 0 0 5 5.25v5.257a5 5 0 0 1 .25-.007H7V5.25C7 4.56 7.56 4 8.25 4h18.5c.69 0 1.25.56 1.25 1.25v12.5c0 .69-.56 1.25-1.25 1.25H14.5v2H20v3h-5.5v2H24a1 1 0 1 0 0-2h-2v-3h4.75A3.25 3.25 0 0 0 30 17.75V5.25A3.25 3.25 0 0 0 26.75 2zM2 15.25A3.25 3.25 0 0 1 5.25 12h4.5A5 5 0 0 1 13 15.25v11.5A3.25 3.25 0 0 1 9.75 30h-4.5A3.25 3.25 0 0 1 2 26.75v-11.5zm3.25-1.25C4.56 14 4 14.56 4 15.25v11.5c0 .69.56 1.25 1.25 1.25h4.5c.69 0 1.25-.56 1.25-1.25v-11.5C10.5 14.56 9.94 14 9.25 14zM7 25a1 1 0 1 0 0 2h1a1 1 0 0 0 0-2z"/>`;

function renderSvg(svg: string, width: number): Buffer {
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width } });
  const png = resvg.render().asPng();
  if (png.length === 0) {
    throw new Error(`Failed to rasterize SVG at ${width}px`);
  }
  return png;
}

function glyphTransform(
  viewSize: number,
  glyphScale: number = GLYPH_SCALE,
): string {
  const scale = (viewSize / GLYPH_VIEWBOX_SIZE) * glyphScale;
  const offset = (viewSize - GLYPH_VIEWBOX_SIZE * scale) / 2;
  return `translate(${offset} ${offset}) scale(${scale})`;
}

/** Brand tile with the near-white glyph centered, scaled to `size`px. */
function brandTileSvg(
  viewSize: number,
  palette: TilePalette = DARK_PALETTE,
): string {
  const radius = (viewSize / TILE_VIEWBOX_SIZE) * TILE_RADIUS;
  const inset = viewSize / TILE_VIEWBOX_SIZE;
  const innerSize = viewSize - inset * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}">
    <defs>
      <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${palette.gradientTop}"/>
        <stop offset="1" stop-color="${palette.gradientBottom}"/>
      </linearGradient>
    </defs>
    <rect x="${inset}" y="${inset}" width="${innerSize}" height="${innerSize}" rx="${radius}" fill="url(#tile)" stroke="${palette.border}" stroke-opacity="${palette.borderOpacity}" stroke-width="${inset}"/>
    <g transform="${glyphTransform(viewSize)}">${GLYPH.replace("currentColor", palette.glyph)}</g>
  </svg>\n`;
}

/** Brand tile rasterized at the requested output size. */
function renderBrandTile(
  size: number,
  palette: TilePalette = DARK_PALETTE,
): Buffer {
  return renderSvg(brandTileSvg(TILE_VIEWBOX_SIZE, palette), size);
}

/** macOS template icon: transparent canvas with only the outline glyph. */
function renderMacosTemplateIcon(size: number): Buffer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TILE_VIEWBOX_SIZE} ${TILE_VIEWBOX_SIZE}">
    <g transform="${glyphTransform(TILE_VIEWBOX_SIZE, MACOS_GLYPH_SCALE)}">${MACOS_TEMPLATE_GLYPH.replace("currentColor", "#000000")}</g>
  </svg>\n`;
  const dpi = size === 16 ? 72 : 144;
  return withPngDpi(renderSvg(svg, size), dpi);
}

/** Add the resolution metadata macOS expects for 1x/2x template images. */
function withPngDpi(png: Buffer, dpi: number): Buffer {
  if (!png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error("Expected a PNG buffer");
  }

  const pixelsPerMeter = Math.round(dpi / 0.0254);
  const phys = Buffer.alloc(9);
  phys.writeUInt32BE(pixelsPerMeter, 0);
  phys.writeUInt32BE(pixelsPerMeter, 4);
  phys.writeUInt8(1, 8);

  const chunks: Buffer[] = [PNG_SIGNATURE];
  let offset = PNG_SIGNATURE.length;
  let inserted = false;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > png.length) {
      throw new Error("Invalid PNG chunk length");
    }

    const type = png.toString("ascii", offset + 4, offset + 8);
    if (type !== "pHYs") {
      chunks.push(png.subarray(offset, end));
    }
    if (type === "IHDR") {
      chunks.push(createPngChunk("pHYs", phys));
      inserted = true;
    }
    offset = end;
  }
  if (!inserted) {
    throw new Error("PNG is missing its IHDR chunk");
  }
  return Buffer.concat(chunks);
}

function createPngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunkData = Buffer.concat([typeBuffer, data]);
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  chunkData.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(chunkData), data.length + 8);
  return chunk;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function write(dir: string, name: string, data: Buffer | string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), data);
  console.log(`wrote ${name}`);
}

// ---------------------------------------------------------------------------
// Windows tray: dark 16px + 32px (2x) brand tile.
// ---------------------------------------------------------------------------

write(TRAY_OUTPUT_DIR, "tray-icon.png", renderBrandTile(16));
write(TRAY_OUTPUT_DIR, "tray-icon@2x.png", renderBrandTile(32));

// macOS menu bar: transparent 16px + 32px (2x) outline template glyph.
// ---------------------------------------------------------------------------

write(
  TRAY_OUTPUT_DIR,
  "tray-icon-macos.png",
  renderMacosTemplateIcon(16),
);
write(
  TRAY_OUTPUT_DIR,
  "tray-icon-macos@2x.png",
  renderMacosTemplateIcon(32),
);

// ---------------------------------------------------------------------------
// App icon: brand tile at 1024x1024. electron-builder reads build/icon.png
// (>=512px) and derives the platform formats.
// ---------------------------------------------------------------------------

write(BUILD_OUTPUT_DIR, "icon.png", renderBrandTile(1024));

// ---------------------------------------------------------------------------
// Favicon: same brand tile, kept as vector for the renderer tab.
// ---------------------------------------------------------------------------

write(ROOT, "public/favicon.svg", brandTileSvg(TILE_VIEWBOX_SIZE));
