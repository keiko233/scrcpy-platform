import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";

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
    }
    const png = await runner.spawnWait([
      "screencap",
      "-p",
      "-d",
      surfaceFlingerId,
    ]);
    abortIfNeeded(signal);
    if (png.byteLength > 64 * 1024 * 1024) {
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
    const worker = await this.#getWorker(languages);
    abortIfNeeded(signal);
    await worker.setParameters({ tessedit_char_whitelist: whitelist });
    abortIfNeeded(signal);
    const result = await worker.recognize(Buffer.from(png), { rectangle });
    abortIfNeeded(signal);
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
    const creating = createWorker([...languages], OEM.LSTM_ONLY, {
      langPath: this.#languageDirectory,
      cacheMethod: "none",
    });
    this.#workerLanguages = key;
    this.#worker = creating;
    try {
      return await creating;
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

export function createAdbOcrRecognitionDriver(
  session: OcrAdbSessionProvider,
  userDataDirectory: string,
): OcrRecognitionDriver {
  return new OcrRecognitionDriver(
    new AdbScreenCaptureSource(session),
    new TesseractOcrEngine(join(userDataDirectory, "ocr-languages")),
  );
}
