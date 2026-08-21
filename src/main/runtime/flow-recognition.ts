import { z } from "zod";

import type { FlowNode, JsonValue } from "../../shared/project-contracts";
import type { FlowActionContext } from "./flow-runtime";

export interface OcrRectangle {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface OcrEngineResult {
  text: string;
  confidence: number;
}

export interface OcrEngine {
  recognize(
    png: Uint8Array,
    languages: readonly OcrLanguage[],
    rectangle: OcrRectangle,
    signal: AbortSignal,
  ): Promise<OcrEngineResult>;
  dispose(): Promise<void>;
}

export interface ScreenCaptureSource {
  capturePng(
    context: FlowActionContext,
    signal: AbortSignal,
  ): Promise<Uint8Array>;
}

export interface FlowRecognitionResult {
  assignments: Record<string, JsonValue>;
}

export interface FlowRecognitionDriver {
  recognize(
    node: FlowNode,
    context: FlowActionContext,
    signal: AbortSignal,
  ): Promise<FlowRecognitionResult>;
  dispose(): Promise<void>;
}

export const OCR_LANGUAGES = ["eng", "chi_sim"] as const;
export type OcrLanguage = (typeof OCR_LANGUAGES)[number];

const OcrNodeDataSchema = z
  .object({
    expectedText: z.string().default(""),
    matchMode: z.enum(["contains", "exact", "regex"]).default("contains"),
    caseSensitive: z.boolean().default(false),
    languages: z
      .enum(["eng", "chi_sim", "eng+chi_sim"])
      .default("eng+chi_sim"),
    x: z.number().finite().nonnegative().default(0),
    y: z.number().finite().nonnegative().default(0),
    width: z.number().finite().positive().optional(),
    height: z.number().finite().positive().optional(),
    timeoutMs: z.number().finite().nonnegative().max(300_000).default(5_000),
    intervalMs: z.number().finite().min(100).max(10_000).default(500),
    failOnTimeout: z.boolean().default(true),
    textVariable: z.string().default("ocrText"),
    confidenceVariable: z.string().default("ocrConfidence"),
    matchedVariable: z.string().default("ocrMatched"),
  })
  .passthrough();

interface PngSize {
  width: number;
  height: number;
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const RESERVED_VARIABLE_NAMES = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

function abortIfNeeded(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("OCR cancelled.", "AbortError");
  }
}

function pngSize(png: Uint8Array): PngSize {
  if (
    png.byteLength < 24 ||
    PNG_SIGNATURE.some((byte, index) => png[index] !== byte)
  ) {
    throw new Error("Android screencap did not return a valid PNG image.");
  }
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (width === 0 || height === 0) {
    throw new Error("Android screencap returned an empty image.");
  }
  return { width, height };
}

function coordinate(value: number): number {
  return Math.round(value);
}

function rectangleOf(
  data: z.infer<typeof OcrNodeDataSchema>,
  image: PngSize,
): OcrRectangle {
  const left = coordinate(data.x);
  const top = coordinate(data.y);
  const width = data.width === undefined ? image.width - left : coordinate(data.width);
  const height =
    data.height === undefined ? image.height - top : coordinate(data.height);
  if (
    left >= image.width ||
    top >= image.height ||
    width <= 0 ||
    height <= 0 ||
    left + width > image.width ||
    top + height > image.height
  ) {
    throw new Error(
      `OCR region (${left}, ${top}, ${width}, ${height}) exceeds screenshot ${image.width}x${image.height}.`,
    );
  }
  return { left, top, width, height };
}

function variableName(value: string, field: string): string {
  const name = value.trim();
  if (
    !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name) ||
    RESERVED_VARIABLE_NAMES.has(name)
  ) {
    throw new Error(`OCR field "${field}" has invalid variable name "${name}".`);
  }
  return name;
}

function normalized(value: string, caseSensitive: boolean): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return caseSensitive ? compact : compact.toLocaleLowerCase();
}

function matchesText(
  actual: string,
  expected: string,
  mode: "contains" | "exact" | "regex",
  caseSensitive: boolean,
): boolean {
  if (expected.trim().length === 0) {
    return true;
  }
  if (mode === "regex") {
    let expression: RegExp;
    try {
      expression = new RegExp(expected, caseSensitive ? "u" : "iu");
    } catch (error) {
      throw new Error(
        `OCR expectedText is not a valid regular expression: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return expression.test(actual);
  }
  const left = normalized(actual, caseSensitive);
  const right = normalized(expected, caseSensitive);
  return mode === "exact" ? left === right : left.includes(right);
}

function languagesOf(value: "eng" | "chi_sim" | "eng+chi_sim"): OcrLanguage[] {
  return value === "eng+chi_sim" ? ["eng", "chi_sim"] : [value];
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  abortIfNeeded(signal);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    timer.unref();
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("OCR cancelled.", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  abortIfNeeded(signal);
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      reject(new DOMException("OCR cancelled.", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function timeoutError(
  timeoutMs: number,
  expectedText: string,
  latestText: string,
): Error {
  return new Error(
    `OCR timed out after ${Math.round(timeoutMs)}ms waiting for ${JSON.stringify(expectedText)}. Last text: ${JSON.stringify(latestText.trim())}.`,
  );
}

export class OcrRecognitionDriver implements FlowRecognitionDriver {
  readonly #capture: ScreenCaptureSource;
  readonly #engine: OcrEngine;

  constructor(capture: ScreenCaptureSource, engine: OcrEngine) {
    this.#capture = capture;
    this.#engine = engine;
  }

  async recognize(
    node: FlowNode,
    context: FlowActionContext,
    signal: AbortSignal,
  ): Promise<FlowRecognitionResult> {
    if (node.type !== "ocr") {
      throw new Error(`Recognition driver cannot execute node type "${node.type}".`);
    }
    const data = OcrNodeDataSchema.parse(node.data);
    const textVariable = variableName(data.textVariable, "textVariable");
    const confidenceVariable = variableName(
      data.confidenceVariable,
      "confidenceVariable",
    );
    const matchedVariable = variableName(data.matchedVariable, "matchedVariable");
    if (
      new Set([textVariable, confidenceVariable, matchedVariable]).size !== 3
    ) {
      throw new Error("OCR output variable names must be unique.");
    }
    const deadline = data.timeoutMs === 0 ? null : Date.now() + data.timeoutMs;
    let latest: OcrEngineResult = { text: "", confidence: 0 };
    let attempted = false;

    const result = (matched: boolean): FlowRecognitionResult => {
      if (!matched && data.failOnTimeout) {
        throw timeoutError(data.timeoutMs, data.expectedText, latest.text);
      }
      return {
        assignments: {
          [textVariable]: latest.text.trim(),
          [confidenceVariable]: Number.isFinite(latest.confidence)
            ? latest.confidence
            : 0,
          [matchedVariable]: matched,
        },
      };
    };

    while (true) {
      abortIfNeeded(signal);
      if (attempted && deadline !== null && Date.now() >= deadline) {
        return result(false);
      }

      const attemptController = new AbortController();
      const onRunAbort = () => attemptController.abort();
      signal.addEventListener("abort", onRunAbort, { once: true });
      const remaining = deadline === null ? null : Math.max(0, deadline - Date.now());
      const timeout = remaining === null
        ? null
        : setTimeout(() => attemptController.abort(), remaining);
      timeout?.unref();
      try {
        const png = await abortable(
          this.#capture.capturePng(context, attemptController.signal),
          attemptController.signal,
        );
        const rectangle = rectangleOf(data, pngSize(png));
        latest = await abortable(
          this.#engine.recognize(
            png,
            languagesOf(data.languages),
            rectangle,
            attemptController.signal,
          ),
          attemptController.signal,
        );
      } catch (error) {
        if (signal.aborted) {
          abortIfNeeded(signal);
        }
        if (attemptController.signal.aborted && deadline !== null) {
          return result(false);
        }
        throw error;
      } finally {
        signal.removeEventListener("abort", onRunAbort);
        if (timeout !== null) {
          clearTimeout(timeout);
        }
      }
      attempted = true;
      abortIfNeeded(signal);
      const matched = matchesText(
        latest.text,
        data.expectedText,
        data.matchMode,
        data.caseSensitive,
      );
      if (
        matched ||
        deadline === null ||
        Date.now() >= deadline ||
        data.expectedText.trim() === ""
      ) {
        return result(matched);
      }
      await delay(
        Math.min(data.intervalMs, Math.max(0, deadline - Date.now())),
        signal,
      );
    }
  }

  async dispose(): Promise<void> {
    await this.#engine.dispose();
  }
}
