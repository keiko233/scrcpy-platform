import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

import { createWorker, OEM, type Worker } from "tesseract.js";

import type { DeviceSessionDto } from "../../shared/device-contracts";
import {
  findDisplayUniqueId,
  findVirtualSurfaceFlingerDisplayId,
  physicalSurfaceFlingerDisplayId,
} from "./android-display-id";
import type { FlowActionContext } from "./flow-runtime";
import {
  OcrRecognitionDriver,
  type OcrEngine,
  type OcrEngineResult,
  type OcrLanguage,
  type OcrRectangle,
  type ScreenCaptureSource,
} from "./flow-recognition";

interface RawAdbCommandRunner {
  spawnWait(command: readonly string[]): Promise<Uint8Array>;
}

interface OcrAdbConnection {
  transportId: string;
  adb: {
    subprocess: {
      noneProtocol: RawAdbCommandRunner;
    };
  };
}

export interface OcrAdbSessionProvider {
  readonly sessionId: string;
  getSession(): DeviceSessionDto;
  getConnection(): OcrAdbConnection | null;
}

export interface OcrScreenSessionProvider {
  getSettings(): { ocrCaptureSource: "scrcpy" | "screencap" };
  captureVideoPng(displayId: number, signal: AbortSignal): Promise<Uint8Array>;
}

interface LanguageDataPackage {
  code: OcrLanguage;
  gzip: boolean;
  langPath: string;
}

function abortIfNeeded(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("OCR cancelled.", "AbortError");
  }
}

const RAW_SCREENSHOT_HEADER_BYTES = 16;
const RAW_SCREENSHOT_PIXEL_FORMAT_RGBA_8888 = 1;
const MAX_SCREENSHOT_BYTES = 64 * 1024 * 1024;

interface RawScreenshot {
  width: number;
  height: number;
  pixels: Buffer;
}

function crc32(value: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const chunk = Buffer.allocUnsafe(12 + data.byteLength);
  chunk.writeUInt32BE(data.byteLength, 0);
  typeBytes.copy(chunk, 4);
  Buffer.from(data).copy(chunk, 8);
  const checksumInput = Buffer.concat([typeBytes, Buffer.from(data)]);
  chunk.writeUInt32BE(crc32(checksumInput), 8 + data.byteLength);
  return chunk;
}

function rawScreenshotOf(raw: Uint8Array): RawScreenshot {
  if (raw.byteLength < RAW_SCREENSHOT_HEADER_BYTES) {
    throw new Error("Android screencap returned an incomplete raw image.");
  }
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const width = view.getUint32(0, true);
  const height = view.getUint32(4, true);
  const format = view.getUint32(8, true);
  if (width === 0 || height === 0) {
    throw new Error("Android screencap returned an empty image.");
  }
  if (format !== RAW_SCREENSHOT_PIXEL_FORMAT_RGBA_8888) {
    throw new Error(`Unsupported Android screencap pixel format ${format}.`);
  }
  const expectedPixelBytes = width * height * 4;
  if (
    !Number.isSafeInteger(expectedPixelBytes) ||
    raw.byteLength < RAW_SCREENSHOT_HEADER_BYTES + expectedPixelBytes
  ) {
    throw new Error("Android screencap returned truncated raw image data.");
  }
  if (RAW_SCREENSHOT_HEADER_BYTES + expectedPixelBytes > MAX_SCREENSHOT_BYTES) {
    throw new Error("Android screencap returned an image larger than 64 MiB.");
  }
  return {
    width,
    height,
    pixels: Buffer.from(
      raw.buffer,
      raw.byteOffset + RAW_SCREENSHOT_HEADER_BYTES,
      expectedPixelBytes,
    ),
  };
}

function encodeRgbaPng(image: RawScreenshot): Uint8Array {
  const scanlines = Buffer.allocUnsafe(image.height * (1 + image.width * 4));
  const rowBytes = image.width * 4;
  for (let row = 0; row < image.height; row += 1) {
    const scanlineOffset = row * (rowBytes + 1);
    scanlines[scanlineOffset] = 0;
    image.pixels.copy(
      scanlines,
      scanlineOffset + 1,
      row * rowBytes,
      (row + 1) * rowBytes,
    );
  }
  const header = Buffer.allocUnsafe(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines, { level: 1 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export class AdbScreenCaptureSource implements ScreenCaptureSource {
  readonly #session: OcrAdbSessionProvider;
  readonly #surfaceFlingerIds = new Map<number, string>();
  #connection: OcrAdbConnection | null = null;

  constructor(session: OcrAdbSessionProvider) {
    this.#session = session;
  }

  async capturePng(
    context: FlowActionContext,
    signal: AbortSignal,
  ): Promise<Uint8Array> {
    abortIfNeeded(signal);
    const connection = this.#session.getConnection();
    const snapshot = this.#session.getSession();
    if (
      connection === null ||
      snapshot.state !== "connected" ||
      connection.transportId !== context.deviceId ||
      this.#session.sessionId !== context.sessionId
    ) {
      throw new Error("The connected Android device session changed during OCR.");
    }
    if (connection !== this.#connection) {
      this.#surfaceFlingerIds.clear();
      this.#connection = connection;
    }
    const runner = connection.adb.subprocess.noneProtocol;
    let surfaceFlingerId = this.#surfaceFlingerIds.get(context.displayId);
    if (surfaceFlingerId === undefined) {
      const dumpsysStartedAt = performance.now();
      const output = await runner.spawnWait(["dumpsys", "display"]);
      abortIfNeeded(signal);
      const uniqueId = findDisplayUniqueId(
        new TextDecoder().decode(output),
        context.displayId,
      );
      surfaceFlingerId = physicalSurfaceFlingerDisplayId(uniqueId) ?? undefined;
      if (surfaceFlingerId === undefined) {
        const surfaceFlingerDump = await runner.spawnWait(["dumpsys", "SurfaceFlinger"]);
        abortIfNeeded(signal);
        surfaceFlingerId = findVirtualSurfaceFlingerDisplayId(
          new TextDecoder().decode(surfaceFlingerDump),
          context.displayId,
        );
      }
      this.#surfaceFlingerIds.set(context.displayId, surfaceFlingerId);
      console.trace("ocr display id resolved", {
        displayId: context.displayId,
        surfaceFlingerId,
        elapsedMs: Math.round(performance.now() - dumpsysStartedAt),
      });
    }
    const screencapStartedAt = performance.now();
    const raw = await runner.spawnWait([
      "screencap",
      "-d",
      surfaceFlingerId,
    ]);
    abortIfNeeded(signal);
    const encodeStartedAt = performance.now();
    const png = encodeRgbaPng(rawScreenshotOf(raw));
    console.trace("ocr screenshot captured", {
      rawBytes: raw.byteLength,
      bytes: png.byteLength,
      elapsedMs: Math.round(performance.now() - screencapStartedAt),
      encodeMs: Math.round(performance.now() - encodeStartedAt),
    });
    if (png.byteLength > MAX_SCREENSHOT_BYTES) {
      throw new Error("Android screencap returned an image larger than 64 MiB.");
    }
    return png;
  }
}

export class TesseractOcrEngine implements OcrEngine {
  readonly #languageDirectory: string;
  #worker: Promise<Worker> | null = null;
  #workerLanguages = "";

  constructor(languageDirectory: string) {
    this.#languageDirectory = languageDirectory;
  }

  async recognize(
    png: Uint8Array,
    languages: readonly OcrLanguage[],
    rectangle: OcrRectangle,
    whitelist: string,
    signal: AbortSignal,
  ): Promise<OcrEngineResult> {
    abortIfNeeded(signal);
    const workerStartedAt = performance.now();
    const worker = await this.#getWorker(languages);
    const workerElapsedMs = Math.round(performance.now() - workerStartedAt);
    abortIfNeeded(signal);
    await worker.setParameters({ tessedit_char_whitelist: whitelist });
    abortIfNeeded(signal);
    const recognizeStartedAt = performance.now();
    const result = await worker.recognize(Buffer.from(png), { rectangle });
    abortIfNeeded(signal);
    console.trace("ocr recognized", {
      languages: [...languages].join("+"),
      rectangle,
      whitelist,
      bytes: png.byteLength,
      confidence: result.data.confidence,
      textLength: result.data.text.length,
      workerInitMs: workerElapsedMs,
      recognizeMs: Math.round(performance.now() - recognizeStartedAt),
    });
    return {
      text: result.data.text,
      confidence: result.data.confidence,
    };
  }

  async dispose(): Promise<void> {
    const worker = this.#worker;
    this.#worker = null;
    this.#workerLanguages = "";
    if (worker !== null) {
      await worker.then((value) => value.terminate()).catch(() => undefined);
    }
  }

  async #getWorker(languages: readonly OcrLanguage[]): Promise<Worker> {
    const key = [...languages].sort().join("+");
    if (this.#worker !== null && this.#workerLanguages === key) {
      return this.#worker;
    }
    await this.dispose();
    await this.#prepareLanguages(languages);
    const initStartedAt = performance.now();
    const creating = createWorker([...languages], OEM.LSTM_ONLY, {
      langPath: this.#languageDirectory,
      cacheMethod: "none",
    });
    this.#workerLanguages = key;
    this.#worker = creating;
    try {
      const created = await creating;
      console.debug("ocr tesseract worker initialized", {
        languages: key,
        elapsedMs: Math.round(performance.now() - initStartedAt),
      });
      return created;
    } catch (error) {
      if (this.#worker === creating) {
        this.#worker = null;
        this.#workerLanguages = "";
      }
      throw error;
    }
  }

  async #prepareLanguages(languages: readonly OcrLanguage[]): Promise<void> {
    await mkdir(this.#languageDirectory, { recursive: true });
    const require = createRequire(import.meta.url);
    for (const language of languages) {
      const packageName = `@tesseract.js-data/${language}`;
      const languagePackage = require(packageName) as LanguageDataPackage;
      if (languagePackage.code !== language || languagePackage.gzip !== true) {
        throw new Error(`Unexpected OCR language package metadata for ${language}.`);
      }
      const source = join(
        languagePackage.langPath,
        `${language}.traineddata.gz`,
      );
      const target = join(
        this.#languageDirectory,
        `${language}.traineddata.gz`,
      );
      await copyFile(source, target);
    }
  }
}

export class ConfigurableOcrScreenCaptureSource implements ScreenCaptureSource {
  readonly #screencap: AdbScreenCaptureSource;
  readonly #screen: OcrScreenSessionProvider;

  constructor(
    screencap: AdbScreenCaptureSource,
    screen: OcrScreenSessionProvider,
  ) {
    this.#screencap = screencap;
    this.#screen = screen;
  }

  async capturePng(
    context: FlowActionContext,
    signal: AbortSignal,
  ): Promise<Uint8Array> {
    if (this.#screen.getSettings().ocrCaptureSource === "screencap") {
      return await this.#screencap.capturePng(context, signal);
    }
    const startedAt = performance.now();
    try {
      const png = await this.#screen.captureVideoPng(context.displayId, signal);
      console.trace("ocr scrcpy frame captured", {
        displayId: context.displayId,
        bytes: png.byteLength,
        elapsedMs: Math.round(performance.now() - startedAt),
      });
      return png;
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }
      console.warn("ocr scrcpy frame unavailable, falling back to screencap", {
        displayId: context.displayId,
        elapsedMs: Math.round(performance.now() - startedAt),
        error: error instanceof Error ? error.message : String(error),
      });
      return await this.#screencap.capturePng(context, signal);
    }
  }
}

export function createAdbOcrRecognitionDriver(
  session: OcrAdbSessionProvider,
  screen: OcrScreenSessionProvider,
  userDataDirectory: string,
): OcrRecognitionDriver {
  return new OcrRecognitionDriver(
    new ConfigurableOcrScreenCaptureSource(
      new AdbScreenCaptureSource(session),
      screen,
    ),
    new TesseractOcrEngine(join(userDataDirectory, "ocr-languages")),
  );
}
