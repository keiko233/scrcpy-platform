import { assert, describe, expect, test } from "vitest";

import type { DeviceSessionDto } from "../../shared/device-contracts";
import type { FlowNode } from "../../shared/project-contracts";
import type { FlowActionContext } from "./flow-runtime";
import {
  OcrRecognitionDriver,
  type OcrEngine,
  type OcrEngineResult,
  type OcrLanguage,
  type OcrRectangle,
  type ScreenCaptureSource,
} from "./flow-recognition";
import { OcrLanguage as OcrLanguageValue } from "../../shared/constants/enums";
import {
  AdbScreenCaptureSource,
  ConfigurableOcrScreenCaptureSource,
} from "./adb-ocr-recognition";

const CONTEXT: FlowActionContext = {
  runId: "run-1",
  deviceId: "device-1",
  sessionId: "session-1",
  displayId: 3,
};

function png(width = 1080, height = 1920): Uint8Array {
  const value = new Uint8Array(24);
  value.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(value.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return value;
}

function rawRgba(width = 2, height = 2): Uint8Array {
  const value = new Uint8Array(16 + width * height * 4);
  const view = new DataView(value.buffer);
  view.setUint32(0, width, true);
  view.setUint32(4, height, true);
  view.setUint32(8, 1, true);
  view.setUint32(12, 1, true);
  for (let index = 16; index < value.byteLength; index += 4) {
    value[index] = 0x13;
    value[index + 1] = 0x19;
    value[index + 2] = 0x1f;
    value[index + 3] = 0xff;
  }
  return value;
}

function ocrNode(data: Record<string, unknown> = {}): FlowNode {
  return {
    id: "ocr",
    type: "ocr",
    position: { x: 0, y: 0 },
    data: { kind: "ocr", ...data } as FlowNode["data"],
  };
}

class FakeCapture implements ScreenCaptureSource {
  calls = 0;
  failures = 0;

  async capturePng(): Promise<Uint8Array> {
    this.calls += 1;
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error("temporary screen capture failure");
    }
    return png();
  }
}

class FakeEngine implements OcrEngine {
  readonly calls: Array<{
    languages: readonly OcrLanguage[];
    rectangle: OcrRectangle;
    whitelist: string;
  }> = [];
  results: OcrEngineResult[] = [{ text: "Ready", confidence: 96 }];
  failures: unknown[] = [];
  disposed = false;

  async recognize(
    _png: Uint8Array,
    languages: readonly OcrLanguage[],
    rectangle: OcrRectangle,
    whitelist: string,
  ): Promise<OcrEngineResult> {
    this.calls.push({ languages, rectangle, whitelist });
    const failure = this.failures[this.calls.length - 1];
    if (failure !== undefined) {
      throw failure;
    }
    return this.results[Math.min(this.calls.length - 1, this.results.length - 1)];
  }

  async dispose(): Promise<void> {
    this.disposed = true;
  }
}

describe("OcrRecognitionDriver", () => {
  test("recognizes a display ROI and returns typed outputs", async () => {
    const capture = new FakeCapture();
    const engine = new FakeEngine();
    const driver = new OcrRecognitionDriver(capture, engine);

    const result = await driver.recognize(
      ocrNode({
        x: 10,
        y: 20,
        width: 300,
        height: 80,
        languages: "eng+chi_sim",
        expectedText: "ready",
        matchMode: "exact",
      }),
      CONTEXT,
      new AbortController().signal,
    );

    assert.deepEqual(result.outputs, {
      text: "Ready",
      confidence: 96,
      matched: true,
    });
    assert.deepEqual(engine.calls, [
      {
        languages: [OcrLanguageValue.Eng, OcrLanguageValue.ChiSim],
        rectangle: { left: 10, top: 20, width: 300, height: 80 },
        whitelist: "",
      },
    ]);
    await driver.dispose();
    assert.equal(engine.disposed, true);
  });

  test("restricts recognition to the configured character set", async () => {
    const capture = new FakeCapture();
    const engine = new FakeEngine();
    const driver = new OcrRecognitionDriver(capture, engine);

    await driver.recognize(
      ocrNode({ charSet: "digits" }),
      CONTEXT,
      new AbortController().signal,
    );
    assert.equal(engine.calls[0]?.whitelist, "0123456789");

    await driver.recognize(
      ocrNode({ charSet: "number" }),
      CONTEXT,
      new AbortController().signal,
    );
    assert.equal(engine.calls[1]?.whitelist, "0123456789.,-");
  });

  test("retries until text matches", async () => {
    const capture = new FakeCapture();
    const engine = new FakeEngine();
    engine.results = [
      { text: "Loading", confidence: 80 },
      { text: "Game READY now", confidence: 91 },
    ];
    const driver = new OcrRecognitionDriver(capture, engine);

    const result = await driver.recognize(
      ocrNode({
        expectedText: "ready",
        timeoutMs: 1_000,
        intervalMs: 100,
      }),
      CONTEXT,
      new AbortController().signal,
    );

    assert.equal(result.outputs.matched, true);
    assert.equal(capture.calls, 2);
  });

  test("can retry an empty OCR result when enabled", async () => {
    const capture = new FakeCapture();
    const engine = new FakeEngine();
    engine.results = [
      { text: "", confidence: 0 },
      { text: "Ready", confidence: 91 },
    ];
    const driver = new OcrRecognitionDriver(capture, engine);

    const result = await driver.recognize(
      ocrNode({
        retryOnEmpty: true,
        timeoutMs: 1_000,
        intervalMs: 100,
      }),
      CONTEXT,
      new AbortController().signal,
    );

    assert.equal(result.outputs.text, "Ready");
    assert.equal(result.outputs.matched, true);
    assert.equal(engine.calls.length, 2);
  });

  test("can retry empty OCR results immediately", async () => {
    const capture = new FakeCapture();
    const engine = new FakeEngine();
    engine.results = [
      { text: "", confidence: 0 },
      { text: "Ready", confidence: 91 },
    ];
    const driver = new OcrRecognitionDriver(capture, engine);

    const result = await driver.recognize(
      ocrNode({
        retryOnEmpty: true,
        retryEmptyImmediately: true,
        timeoutMs: 50,
        intervalMs: 100,
      }),
      CONTEXT,
      new AbortController().signal,
    );

    assert.equal(result.outputs.matched, true);
    assert.equal(engine.calls.length, 2);
  });

  test("can continue after a timeout and expose an unsuccessful result", async () => {
    const capture = new FakeCapture();
    const engine = new FakeEngine();
    engine.results = [{ text: "Loading", confidence: 80 }];
    const driver = new OcrRecognitionDriver(capture, engine);

    const result = await driver.recognize(
      ocrNode({
        expectedText: "ready",
        timeoutMs: 0,
        continueOnFailure: true,
      }),
      CONTEXT,
      new AbortController().signal,
    );

    assert.deepEqual(result.outputs, {
      text: "Loading",
      confidence: 80,
      matched: false,
    });
  });

  test("can continue after repeated empty OCR results", async () => {
    const capture = new FakeCapture();
    const engine = new FakeEngine();
    engine.results = [{ text: "", confidence: 0 }];
    const driver = new OcrRecognitionDriver(capture, engine);

    const result = await driver.recognize(
      ocrNode({
        retryOnEmpty: true,
        timeoutMs: 120,
        intervalMs: 100,
        continueOnFailure: true,
      }),
      CONTEXT,
      new AbortController().signal,
    );

    assert.equal(result.outputs.matched, false);
    assert.ok(engine.calls.length > 1);
  });

  test("retries transient capture and recognition failures", async () => {
    const capture = new FakeCapture();
    capture.failures = 1;
    const engine = new FakeEngine();
    engine.failures = [new Error("temporary OCR engine failure")];
    const driver = new OcrRecognitionDriver(capture, engine);

    const result = await driver.recognize(
      ocrNode({ timeoutMs: 1_000, intervalMs: 100 }),
      CONTEXT,
      new AbortController().signal,
    );

    assert.equal(result.outputs.matched, true);
    assert.equal(capture.calls, 3);
    assert.equal(engine.calls.length, 2);
  });

  test("returns or fails only after transient errors exhaust the timeout", async () => {
    const capture = new FakeCapture();
    const engine = new FakeEngine();
    engine.failures = [
      new Error("temporary OCR engine failure"),
      new Error("temporary OCR engine failure"),
      new Error("temporary OCR engine failure"),
    ];
    const driver = new OcrRecognitionDriver(capture, engine);

    const result = await driver.recognize(
      ocrNode({ timeoutMs: 250, intervalMs: 100, failOnTimeout: false }),
      CONTEXT,
      new AbortController().signal,
    );
    assert.deepEqual(result.outputs, {
      text: "",
      confidence: 0,
      matched: false,
    });
    assert.ok(engine.calls.length > 1);

    const strictEngine = new FakeEngine();
    strictEngine.failures = Array.from(
      { length: 10 },
      () => new Error("temporary OCR engine failure"),
    );
    await expect(
      new OcrRecognitionDriver(new FakeCapture(), strictEngine).recognize(
        ocrNode({ timeoutMs: 250, intervalMs: 100, failOnTimeout: true }),
        CONTEXT,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/OCR timed out/);
  });

  test("can return a false match or fail after a single timed attempt", async () => {
    const capture = new FakeCapture();
    const engine = new FakeEngine();
    engine.results = [{ text: "Loading", confidence: 80 }];
    const driver = new OcrRecognitionDriver(capture, engine);

    const result = await driver.recognize(
      ocrNode({ expectedText: "ready", timeoutMs: 0, failOnTimeout: false }),
      CONTEXT,
      new AbortController().signal,
    );
    assert.deepEqual(result.outputs, {
      text: "Loading",
      confidence: 80,
      matched: false,
    });

    await expect(
      driver.recognize(
        ocrNode({ expectedText: "ready", timeoutMs: 0, failOnTimeout: true }),
        CONTEXT,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/OCR timed out.*ready.*Loading/);
  });

  test("rejects invalid regions, regexes, and cancellation", async () => {
    const capture = new FakeCapture();
    const engine = new FakeEngine();
    const driver = new OcrRecognitionDriver(capture, engine);

    await expect(
      driver.recognize(
        ocrNode({ x: 1_000, width: 100, height: 100 }),
        CONTEXT,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/exceeds screenshot/);
    await expect(
      driver.recognize(
        ocrNode({ expectedText: "[", matchMode: "regex" }),
        CONTEXT,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/not a valid regular expression/);
    const controller = new AbortController();
    controller.abort();
    await expect(
      driver.recognize(ocrNode(), CONTEXT, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  test("bounds a hanging recognition attempt by the node timeout", async () => {
    const engine: OcrEngine = {
      recognize: async () => new Promise<OcrEngineResult>(() => undefined),
      dispose: async () => undefined,
    };
    const driver = new OcrRecognitionDriver(new FakeCapture(), engine);
    const startedAt = Date.now();

    const result = await driver.recognize(
      ocrNode({ expectedText: "ready", timeoutMs: 10, failOnTimeout: false }),
      CONTEXT,
      new AbortController().signal,
    );

    assert.equal(result.outputs.matched, false);
    assert.ok(Date.now() - startedAt < 500);
  });

  test("cancels while screen capture is still pending", async () => {
    const capture: ScreenCaptureSource = {
      capturePng: async () => new Promise<Uint8Array>(() => undefined),
    };
    const driver = new OcrRecognitionDriver(capture, new FakeEngine());
    const controller = new AbortController();
    const recognition = driver.recognize(ocrNode(), CONTEXT, controller.signal);
    controller.abort();

    await expect(recognition).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("AdbScreenCaptureSource", () => {
  test("captures the exact physical run display and converts raw RGBA bytes to PNG", async () => {
    const commands: readonly string[][] = [];
    const mutableCommands = commands as string[][];
    const session = {
      sessionId: "session-1",
      getSession: (): DeviceSessionDto =>
        ({ state: "connected" }) as DeviceSessionDto,
      getConnection: () => ({
        transportId: "device-1",
        adb: {
          subprocess: {
            noneProtocol: {
              spawnWait: async (command: readonly string[]) => {
                mutableCommands.push([...command]);
                if (command[0] === "dumpsys") {
                  return new TextEncoder().encode(
                    "mViewports=[DisplayViewport{type=VIRTUAL, displayId=3, uniqueId='local:4630946545580055170'}]",
                  );
                }
                return rawRgba();
              },
            },
          },
        },
      }),
    };
    const capture = new AdbScreenCaptureSource(session);

    const result = await capture.capturePng(
      CONTEXT,
      new AbortController().signal,
    );

    assert.deepEqual([...result.subarray(0, 8)], [
      137,
      80,
      78,
      71,
      13,
      10,
      26,
      10,
    ]);
    const pngHeader = new DataView(result.buffer, result.byteOffset, result.byteLength);
    assert.equal(pngHeader.getUint32(16, false), 2);
    assert.equal(pngHeader.getUint32(20, false), 2);
    assert.deepEqual(commands, [
      ["dumpsys", "display"],
      ["screencap", "-d", "4630946545580055170"],
    ]);
  });

  test("resolves a virtual run display through SurfaceFlinger", async () => {
    const commands: string[][] = [];
    const session = {
      sessionId: "session-1",
      getSession: (): DeviceSessionDto =>
        ({ state: "connected" }) as DeviceSessionDto,
      getConnection: () => ({
        transportId: "device-1",
        adb: {
          subprocess: {
            noneProtocol: {
              spawnWait: async (command: readonly string[]) => {
                commands.push([...command]);
                if (command[1] === "display") {
                  return new TextEncoder().encode(
                    "mViewports=[DisplayViewport{type=VIRTUAL, displayId=3, uniqueId='virtual:owner,1,scrcpy,2'}]",
                  );
                }
                if (command[0] === "dumpsys") {
                  return new TextEncoder().encode(
                    'Display 11529215046235404656 (virtual, "scrcpy")\n   Composition Display State:\n   layerFilter={layerStack=3 toInternalDisplay=false }',
                  );
                }
                return rawRgba();
              },
            },
          },
        },
      }),
    };
    const capture = new AdbScreenCaptureSource(session);

    await capture.capturePng(CONTEXT, new AbortController().signal);

    assert.deepEqual(commands, [
      ["dumpsys", "display"],
      ["dumpsys", "SurfaceFlinger"],
      ["screencap", "-d", "11529215046235404656"],
    ]);
  });

  test("invalidates display mappings when the ADB connection changes", async () => {
    const commands: string[][] = [];
    let physicalId = "111";
    const commandRunner = {
      spawnWait: async (command: readonly string[]) => {
        commands.push([...command]);
        if (command[0] === "dumpsys") {
          return new TextEncoder().encode(
            `mViewports=[DisplayViewport{type=INTERNAL, displayId=3, uniqueId='local:${physicalId}'}]`,
          );
        }
        return rawRgba();
      },
    };
    let connection = {
      transportId: "device-1",
      adb: { subprocess: { noneProtocol: commandRunner } },
    };
    const capture = new AdbScreenCaptureSource({
      sessionId: "session-1",
      getSession: () => ({ state: "connected" }) as DeviceSessionDto,
      getConnection: () => connection,
    });

    await capture.capturePng(CONTEXT, new AbortController().signal);
    physicalId = "222";
    connection = {
      transportId: "device-1",
      adb: { subprocess: { noneProtocol: commandRunner } },
    };
    await capture.capturePng(CONTEXT, new AbortController().signal);

    assert.deepEqual(commands, [
      ["dumpsys", "display"],
      ["screencap", "-d", "111"],
      ["dumpsys", "display"],
      ["screencap", "-d", "222"],
    ]);
  });

  test("rejects a changed device session", async () => {
    const capture = new AdbScreenCaptureSource({
      sessionId: "other-session",
      getSession: () => ({ state: "connected" }) as DeviceSessionDto,
      getConnection: () => null,
    });
    await expect(
      capture.capturePng(CONTEXT, new AbortController().signal),
    ).rejects.toThrow(/session changed/);
  });
});

describe("ConfigurableOcrScreenCaptureSource", () => {
  test("uses the decoded scrcpy frame by default", async () => {
    let scrcpyCalls = 0;
    const screencap = {
      capturePng: async () => {
        throw new Error("screencap should not be selected");
      },
    } as unknown as AdbScreenCaptureSource;
    const source = new ConfigurableOcrScreenCaptureSource(screencap, {
      getSettings: () => ({ ocrCaptureSource: "scrcpy" }),
      captureVideoPng: async () => {
        scrcpyCalls += 1;
        return png();
      },
    });

    const result = await source.capturePng(
      CONTEXT,
      new AbortController().signal,
    );

    assert.equal(result.byteLength, 24);
    assert.equal(scrcpyCalls, 1);
  });

  test("keeps the ADB screencap source available", async () => {
    const expected = png();
    const screencap = {
      capturePng: async () => expected,
    } as unknown as AdbScreenCaptureSource;
    const source = new ConfigurableOcrScreenCaptureSource(screencap, {
      getSettings: () => ({ ocrCaptureSource: "screencap" }),
      captureVideoPng: async () => {
        throw new Error("scrcpy should not be selected");
      },
    });

    assert.equal(
      await source.capturePng(CONTEXT, new AbortController().signal),
      expected,
    );
  });
});
