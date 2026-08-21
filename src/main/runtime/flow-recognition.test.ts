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
import { AdbScreenCaptureSource } from "./adb-ocr-recognition";

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

  async capturePng(): Promise<Uint8Array> {
    this.calls += 1;
    return png();
  }
}

class FakeEngine implements OcrEngine {
  readonly calls: Array<{
    languages: readonly OcrLanguage[];
    rectangle: OcrRectangle;
  }> = [];
  results: OcrEngineResult[] = [{ text: "Ready", confidence: 96 }];
  disposed = false;

  async recognize(
    _png: Uint8Array,
    languages: readonly OcrLanguage[],
    rectangle: OcrRectangle,
  ): Promise<OcrEngineResult> {
    this.calls.push({ languages, rectangle });
    return this.results[Math.min(this.calls.length - 1, this.results.length - 1)];
  }

  async dispose(): Promise<void> {
    this.disposed = true;
  }
}

describe("OcrRecognitionDriver", () => {
  test("recognizes a display ROI and returns configurable variables", async () => {
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
        textVariable: "screenText",
        confidenceVariable: "screenConfidence",
        matchedVariable: "screenMatched",
      }),
      CONTEXT,
      new AbortController().signal,
    );

    assert.deepEqual(result.assignments, {
      screenText: "Ready",
      screenConfidence: 96,
      screenMatched: true,
    });
    assert.deepEqual(engine.calls, [
      {
        languages: ["eng", "chi_sim"],
        rectangle: { left: 10, top: 20, width: 300, height: 80 },
      },
    ]);
    await driver.dispose();
    assert.equal(engine.disposed, true);
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

    assert.equal(result.assignments.ocrMatched, true);
    assert.equal(capture.calls, 2);
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
    assert.deepEqual(result.assignments, {
      ocrText: "Loading",
      ocrConfidence: 80,
      ocrMatched: false,
    });

    await expect(
      driver.recognize(
        ocrNode({ expectedText: "ready", timeoutMs: 0, failOnTimeout: true }),
        CONTEXT,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/OCR timed out.*ready.*Loading/);
  });

  test("rejects invalid regions, regexes, variables, and cancellation", async () => {
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
    await expect(
      driver.recognize(
        ocrNode({ textVariable: "__proto__" }),
        CONTEXT,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/invalid variable name/);
    const controller = new AbortController();
    controller.abort();
    await expect(
      driver.recognize(ocrNode(), CONTEXT, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  test("rejects colliding output variables", async () => {
    const driver = new OcrRecognitionDriver(new FakeCapture(), new FakeEngine());
    await expect(
      driver.recognize(
        ocrNode({
          textVariable: "ocrResult",
          confidenceVariable: "ocrResult",
        }),
        CONTEXT,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/must be unique/);
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

    assert.equal(result.assignments.ocrMatched, false);
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
  test("captures the exact physical run display as PNG bytes", async () => {
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
                return png();
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

    assert.equal(result.byteLength, 24);
    assert.deepEqual(commands, [
      ["dumpsys", "display"],
      ["screencap", "-p", "-d", "4630946545580055170"],
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
                return png();
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
      ["screencap", "-p", "-d", "11529215046235404656"],
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
        return png();
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
      ["screencap", "-p", "-d", "111"],
      ["dumpsys", "display"],
      ["screencap", "-p", "-d", "222"],
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
