import { assert, describe, test } from "vitest";

import type {
  FlowDocument,
  FlowNode,
  FlowNodeKind,
  ScriptDto,
} from "../../shared/project-contracts";
import {
  FlowRunDtoSchema,
  type FlowRunDto,
} from "../../shared/run-contracts";
import {
  FlowRuntimeService,
  type FlowActionContext,
  type FlowActionDriver,
  type FlowRunTarget,
} from "./flow-runtime";
import type {
  FlowRecognitionDriver,
  FlowRecognitionResult,
} from "./flow-recognition";

function node(
  id: string,
  type: FlowNodeKind,
  data: Record<string, unknown> = {},
): FlowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { kind: type, ...data } as FlowNode["data"],
  };
}

function linearDocument(middle: FlowNode[] = []): FlowDocument {
  const nodes = [node("start", "start"), ...middle, node("end", "end")];
  return {
    schemaVersion: 1,
    nodes,
    edges: nodes.slice(0, -1).map((source, index) => ({
      id: `edge-${index}`,
      source: source.id,
      target: nodes[index + 1].id,
      sourceHandle: "next",
      targetHandle: "in",
    })),
  };
}

function graphDocument(
  nodes: FlowNode[],
  edges: Array<
    [
      id: string,
      source: string,
      target: string,
      sourceHandle: string,
      targetHandle: string,
    ]
  >,
): FlowDocument {
  return {
    schemaVersion: 1,
    nodes,
    edges: edges.map(
      ([id, source, target, sourceHandle, targetHandle]) => ({
        id,
        source,
        target,
        sourceHandle,
        targetHandle,
      }),
    ),
  };
}

function script(document: FlowDocument): ScriptDto {
  return {
    id: "script-1",
    projectId: "project-1",
    name: "Main",
    path: "/flows/main.json",
    draftVersion: 1,
    draftDocument: document,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function constantNode(
  id: string,
  value: number | string | boolean,
): FlowNode {
  if (typeof value === "boolean") {
    return node(id, "constant", { type: "boolean", booleanValue: value });
  }
  if (typeof value === "string") {
    return node(id, "constant", { type: "string", stringValue: value });
  }
  return node(id, "constant", { type: "number", numberValue: value });
}

class FakeDriver implements FlowActionDriver {
  target: FlowRunTarget | null = {
    deviceId: "device-1",
    sessionId: "session-1",
  };
  readonly calls: Array<{
    nodeId: string;
    context: FlowActionContext;
    data: FlowNode["data"];
  }> = [];
  error: Error | null = null;

  getTarget(): FlowRunTarget | null {
    return this.target;
  }

  async execute(
    action: FlowNode,
    context: FlowActionContext,
    signal: AbortSignal,
  ): Promise<void> {
    this.calls.push({
      nodeId: action.id,
      context,
      data: structuredClone(action.data),
    });
    if (signal.aborted) {
      throw new Error("aborted");
    }
    if (this.error !== null) {
      throw this.error;
    }
  }
}

class FakeRecognition implements FlowRecognitionDriver {
  readonly calls: string[] = [];
  readonly nodeData: FlowNode["data"][] = [];
  outputs: FlowRecognitionResult["outputs"] = {
    text: "Ready",
    confidence: 96,
    matched: true,
  };
  disposed = false;

  async recognize(node: FlowNode): Promise<FlowRecognitionResult> {
    this.calls.push(node.id);
    this.nodeData.push(structuredClone(node.data));
    return { outputs: this.outputs };
  }

  async dispose(): Promise<void> {
    this.disposed = true;
  }
}

const RUN_INPUT = {
  scriptId: "script-1",
  deviceId: "device-1",
  sessionId: "session-1",
  displayId: 4,
} as const;

function serviceFor(
  document: FlowDocument,
  driver = new FakeDriver(),
  recognition?: FlowRecognitionDriver,
) {
  const repository = {
    getScript: ({ scriptId }: { scriptId: string }) =>
      scriptId === "script-1" ? script(document) : null,
  };
  const service = new FlowRuntimeService(repository, driver, {
    createRunId: () => "run-1",
    recognition,
  });
  return { service, driver };
}

async function waitForTerminal(service: FlowRuntimeService): Promise<FlowRunDto> {
  const current = service.getRun();
  if (current !== null && current.state !== "running") {
    return current;
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("Timed out waiting for flow run."));
    }, 1000);
    const unsubscribe = service.subscribe((run) => {
      if (run.state !== "running") {
        clearTimeout(timeout);
        unsubscribe();
        resolve(run);
      }
    });
  });
}

async function waitForState(
  service: FlowRuntimeService,
  predicate: (run: FlowRunDto) => boolean,
): Promise<FlowRunDto> {
  const current = service.getRun();
  if (current !== null && predicate(current)) {
    return current;
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("Timed out waiting for flow run state."));
    }, 1000);
    const unsubscribe = service.subscribe((run) => {
      if (predicate(run)) {
        clearTimeout(timeout);
        unsubscribe();
        resolve(run);
      }
    });
  });
}

describe("FlowRuntimeService", () => {
  test("runs a valid linear flow in deterministic order and publishes snapshots", async () => {
    const click = node("click", "click", { x: 10, y: 20 });
    const { service, driver } = serviceFor(linearDocument([click]));
    const snapshots: FlowRunDto[] = [];
    service.subscribe((run) => snapshots.push(run));

    const result = service.start(RUN_INPUT);
    assert.equal(result.status, "ok");
    const completed = await waitForTerminal(service);

    assert.equal(completed.runId, "run-1");
    assert.equal(completed.state, "completed");
    assert.doesNotThrow(() => FlowRunDtoSchema.parse(completed));
    assert.deepEqual(
      completed.steps.map((step) => [step.nodeId, step.state]),
      [
        ["start", "completed"],
        ["click", "completed"],
        ["end", "completed"],
      ],
    );
    assert.deepEqual(driver.calls.map((call) => call.nodeId), ["click"]);
    assert.equal(driver.calls[0]?.context.displayId, 4);
    assert.ok(snapshots.length >= 4);
  });

  test("rejects missing scripts, target mismatches, and invalid graphs", () => {
    const { service, driver } = serviceFor(linearDocument());
    assert.deepEqual(
      service.start({ ...RUN_INPUT, scriptId: "missing" }),
      { status: "error", error: "script-not-found" },
    );

    driver.target = null;
    assert.deepEqual(service.start(RUN_INPUT), {
      status: "error",
      error: "device-not-connected",
    });
    driver.target = { deviceId: "other", sessionId: "session-1" };
    assert.deepEqual(service.start(RUN_INPUT), {
      status: "error",
      error: "device-mismatch",
    });
    driver.target = { deviceId: "device-1", sessionId: "other" };
    assert.deepEqual(service.start(RUN_INPUT), {
      status: "error",
      error: "session-mismatch",
    });

    const invalid = serviceFor({ schemaVersion: 1, nodes: [], edges: [] });
    const result = invalid.service.start(RUN_INPUT);
    assert.equal(result.status, "error");
    if (result.status === "error") {
      assert.equal(result.error, "invalid-flow");
      assert.ok((result.issues?.length ?? 0) > 0);
    }
  });

  test("allows only one active run and stop is idempotent", async () => {
    const { service } = serviceFor(
      linearDocument([node("delay", "delay", { ms: 10_000 })]),
    );
    const started = service.start(RUN_INPUT);
    assert.equal(started.status, "ok");
    assert.deepEqual(service.start(RUN_INPUT), {
      status: "error",
      error: "run-busy",
    });

    const stopped = await service.stop({ runId: "run-1" });
    assert.equal(stopped.status, "ok");
    if (stopped.status === "ok") {
      assert.equal(stopped.run.state, "cancelled");
      assert.equal(
        stopped.run.steps.some((step) => step.state === "pending"),
        false,
      );
    }
    const stoppedAgain = await service.stop({ runId: "run-1" });
    assert.equal(stoppedAgain.status, "ok");
    assert.deepEqual(await service.stop({ runId: "other" }), {
      status: "error",
      error: "run-not-found",
    });
  });

  test("fails the current step and does not start later actions", async () => {
    const first = node("first", "click", { x: 1, y: 2 });
    const second = node("second", "click", { x: 3, y: 4 });
    const { service, driver } = serviceFor(linearDocument([first, second]));
    driver.error = new Error("driver failed");

    service.start(RUN_INPUT);
    const failed = await waitForTerminal(service);
    assert.equal(failed.state, "failed");
    assert.equal(failed.error, "driver failed");
    assert.deepEqual(driver.calls.map((call) => call.nodeId), ["first"]);
    assert.equal(
      failed.steps.find((step) => step.nodeId === "first")?.state,
      "failed",
    );
    assert.equal(
      failed.steps.find((step) => step.nodeId === "second")?.state,
      "pending",
    );
  });

  test("reports a missing OCR recognition driver", async () => {
    const { service } = serviceFor(linearDocument([node("ocr", "ocr")]));
    service.start(RUN_INPUT);
    const failed = await waitForTerminal(service);
    assert.equal(failed.state, "failed");
    assert.match(failed.error ?? "", /OCR node.*no recognition driver/);
  });

  test("routes OCR outputs through a compare into an assert", async () => {
    const recognition = new FakeRecognition();
    const document = graphDocument(
      [
        node("start", "start"),
        node("ocr", "ocr"),
        node("cmp", "compare", { operator: "==" }),
        constantNode("const-ready", "Ready"),
        node("assert", "assert"),
        node("end", "end"),
      ],
      [
        ["e1", "start", "ocr", "next", "in"],
        ["e2", "ocr", "assert", "next", "in"],
        ["e3", "assert", "end", "next", "in"],
        ["data-1", "ocr", "cmp", "text", "left"],
        ["data-2", "const-ready", "cmp", "value", "right"],
        ["data-3", "cmp", "assert", "result", "condition"],
      ],
    );
    const { service } = serviceFor(document, new FakeDriver(), recognition);

    service.start(RUN_INPUT);
    const completed = await waitForTerminal(service);
    assert.equal(completed.state, "completed");
    assert.deepEqual(recognition.calls, ["ocr"]);
    await service.dispose();
    assert.equal(recognition.disposed, true);
  });

  test("routes typed OCR outputs into an If condition and branches", async () => {
    const recognition = new FakeRecognition();
    const document = graphDocument(
      [
        node("start", "start"),
        node("ocr", "ocr"),
        node("if", "if"),
        node("true-action", "click", { x: 1, y: 2 }),
        node("false-action", "click", { x: 3, y: 4 }),
        node("merge", "merge"),
        node("end", "end"),
      ],
      [
        ["e1", "start", "ocr", "next", "in"],
        ["e2", "ocr", "if", "next", "in"],
        ["data-1", "ocr", "if", "matched", "condition"],
        ["e3", "if", "true-action", "true", "in"],
        ["e4", "if", "false-action", "false", "in"],
        ["e5", "true-action", "merge", "next", "a"],
        ["e6", "false-action", "merge", "next", "b"],
        ["e7", "merge", "end", "next", "in"],
      ],
    );
    const { service, driver } = serviceFor(document, new FakeDriver(), recognition);

    service.start(RUN_INPUT);
    const completed = await waitForTerminal(service);

    assert.equal(completed.state, "completed");
    assert.deepEqual(driver.calls.map((call) => call.nodeId), ["true-action"]);
    assert.equal(
      completed.steps.find((step) => step.nodeId === "false-action")?.state,
      "skipped",
    );
  });

  test("computes a value and compares it downstream", async () => {
    const document = graphDocument(
      [
        node("start", "start"),
        node("calc", "calculate", {
          operation: "expression",
          inputCount: 0,
          expression: "6 * 7",
        }),
        node("cmp", "compare", { operator: "==" }),
        constantNode("const-42", 42),
        node("assert", "assert"),
        node("end", "end"),
      ],
      [
        ["e1", "start", "calc", "next", "in"],
        ["e2", "calc", "assert", "next", "in"],
        ["e3", "assert", "end", "next", "in"],
        ["data-1", "calc", "cmp", "value", "left"],
        ["data-2", "const-42", "cmp", "value", "right"],
        ["data-3", "cmp", "assert", "result", "condition"],
      ],
    );
    const { service } = serviceFor(document);

    service.start(RUN_INPUT);
    const completed = await waitForTerminal(service);

    assert.equal(completed.state, "completed");
  });

  test("aggregates connected values and asserts the result", async () => {
    const document = graphDocument(
      [
        node("start", "start"),
        constantNode("seed-a", 4),
        constantNode("seed-b", 9),
        constantNode("seed-c", 2),
        node("calc", "calculate", {
          operation: "max",
          inputCount: 3,
        }),
        node("cmp", "compare", { operator: "==" }),
        constantNode("const-9", 9),
        node("assert", "assert"),
        node("end", "end"),
      ],
      [
        ["e1", "start", "calc", "next", "in"],
        ["e2", "calc", "assert", "next", "in"],
        ["e3", "assert", "end", "next", "in"],
        ["data-1", "seed-a", "calc", "value", "a"],
        ["data-2", "seed-b", "calc", "value", "b"],
        ["data-3", "seed-c", "calc", "value", "c"],
        ["data-4", "calc", "cmp", "value", "left"],
        ["data-5", "const-9", "cmp", "value", "right"],
        ["data-6", "cmp", "assert", "result", "condition"],
      ],
    );
    const { service } = serviceFor(document);

    service.start(RUN_INPUT);
    const completed = await waitForTerminal(service);

    assert.equal(completed.state, "completed");
  });

  test("counts values supplied through connected data inputs", async () => {
    const document = graphDocument(
      [
        node("start", "start"),
        constantNode("source", 1),
        node("calc", "calculate", {
          operation: "count",
          inputCount: 1,
        }),
        node("cmp", "compare", { operator: "==" }),
        constantNode("const-1", 1),
        node("assert", "assert"),
        node("end", "end"),
      ],
      [
        ["e1", "start", "calc", "next", "in"],
        ["e2", "calc", "assert", "next", "in"],
        ["e3", "assert", "end", "next", "in"],
        ["data-1", "source", "calc", "value", "a"],
        ["data-2", "calc", "cmp", "value", "left"],
        ["data-3", "const-1", "cmp", "value", "right"],
        ["data-4", "cmp", "assert", "result", "condition"],
      ],
    );
    const { service } = serviceFor(document);

    service.start(RUN_INPUT);
    const completed = await waitForTerminal(service);

    assert.equal(completed.state, "completed");
  });

  test("sums multiple connected values", async () => {
    const document = graphDocument(
      [
        node("start", "start"),
        constantNode("seed-a", 4),
        constantNode("seed-b", 9),
        node("calc", "calculate", {
          operation: "sum",
          inputCount: 2,
        }),
        node("cmp", "compare", { operator: "==" }),
        constantNode("const-13", 13),
        node("assert", "assert"),
        node("end", "end"),
      ],
      [
        ["e1", "start", "calc", "next", "in"],
        ["e2", "calc", "assert", "next", "in"],
        ["e3", "assert", "end", "next", "in"],
        ["data-1", "seed-a", "calc", "value", "a"],
        ["data-2", "seed-b", "calc", "value", "b"],
        ["data-3", "calc", "cmp", "value", "left"],
        ["data-4", "const-13", "cmp", "value", "right"],
        ["data-5", "cmp", "assert", "result", "condition"],
      ],
    );
    const { service } = serviceFor(document);

    service.start(RUN_INPUT);
    const completed = await waitForTerminal(service);

    assert.equal(completed.state, "completed");
  });

  test("evaluates a custom expression over connected inputs", async () => {
    const document = graphDocument(
      [
        node("start", "start"),
        constantNode("seed-a", 10),
        constantNode("seed-b", 4),
        constantNode("seed-c", 2),
        node("calc", "calculate", {
          operation: "expression",
          inputCount: 3,
          expression: "(a - b) / c",
        }),
        node("cmp", "compare", { operator: "==" }),
        constantNode("const-3", 3),
        node("assert", "assert"),
        node("end", "end"),
      ],
      [
        ["e1", "start", "calc", "next", "in"],
        ["e2", "calc", "assert", "next", "in"],
        ["e3", "assert", "end", "next", "in"],
        ["data-1", "seed-a", "calc", "value", "a"],
        ["data-2", "seed-b", "calc", "value", "b"],
        ["data-3", "seed-c", "calc", "value", "c"],
        ["data-4", "calc", "cmp", "value", "left"],
        ["data-5", "const-3", "cmp", "value", "right"],
        ["data-6", "cmp", "assert", "result", "condition"],
      ],
    );
    const { service } = serviceFor(document);

    service.start(RUN_INPUT);
    const completed = await waitForTerminal(service);

    assert.equal(completed.state, "completed");
  });

  test("converts a connected OCR text value before calculating", async () => {
    const recognition = new FakeRecognition();
    recognition.outputs = {
      text: "96",
      confidence: 96,
      matched: true,
    };
    const document = graphDocument(
      [
        node("start", "start"),
        node("ocr", "ocr"),
        node("convert", "convert", { toType: "number" }),
        node("calc", "calculate", {
          operation: "max",
          inputCount: 1,
        }),
        node("cmp", "compare", { operator: "==" }),
        constantNode("const-96", 96),
        node("assert", "assert"),
        node("end", "end"),
      ],
      [
        ["e1", "start", "ocr", "next", "in"],
        ["e2", "ocr", "convert", "next", "in"],
        ["data-1", "ocr", "convert", "text", "value"],
        ["e3", "convert", "calc", "next", "in"],
        ["data-2", "convert", "calc", "value", "a"],
        ["e4", "calc", "assert", "next", "in"],
        ["data-3", "calc", "cmp", "value", "left"],
        ["data-4", "const-96", "cmp", "value", "right"],
        ["data-5", "cmp", "assert", "result", "condition"],
        ["e5", "assert", "end", "next", "in"],
      ],
    );
    const { service } = serviceFor(document, new FakeDriver(), recognition);

    service.start(RUN_INPUT);
    const completed = await waitForTerminal(service);

    assert.equal(completed.state, "completed");
  });

  test("overrides action fields with connected typed input values", async () => {
    const document = linearDocument([
      node("click", "click", { x: 1, y: 2 }),
    ]);
    const source = constantNode("source", 17);
    document.nodes.push(source);
    document.edges.push(
      {
        id: "data-x",
        source: "source",
        target: "click",
        sourceHandle: "value",
        targetHandle: "x",
      },
      {
        id: "data-y",
        source: "source",
        target: "click",
        sourceHandle: "value",
        targetHandle: "y",
      },
    );
    const { service, driver } = serviceFor(document);

    service.start(RUN_INPUT);
    const completed = await waitForTerminal(service);

    assert.equal(completed.state, "completed");
    assert.equal(driver.calls[0]?.data.x, 17);
    assert.equal(driver.calls[0]?.data.y, 17);
  });

  test("compares constants, takes one If branch, and merges", async () => {
    const document = graphDocument(
      [
        node("start", "start"),
        node("cmp", "compare", { operator: ">=" }),
        constantNode("const-3", 3),
        node("if", "if"),
        node("true-action", "click", { x: 1, y: 2 }),
        node("false-action", "click", { x: 3, y: 4 }),
        node("merge", "merge"),
        node("end", "end"),
      ],
      [
        ["e1", "start", "if", "next", "in"],
        ["e2", "if", "true-action", "true", "in"],
        ["e3", "if", "false-action", "false", "in"],
        ["e4", "true-action", "merge", "next", "a"],
        ["e5", "false-action", "merge", "next", "b"],
        ["e6", "merge", "end", "next", "in"],
        ["data-1", "const-3", "cmp", "value", "left"],
        ["data-2", "const-3", "cmp", "value", "right"],
        ["data-3", "cmp", "if", "result", "condition"],
      ],
    );
    const { service, driver } = serviceFor(document);

    service.start(RUN_INPUT);
    const completed = await waitForTerminal(service);

    assert.equal(completed.state, "completed");
    assert.deepEqual(driver.calls.map((call) => call.nodeId), ["true-action"]);
    assert.equal(
      completed.steps.find((step) => step.nodeId === "false-action")?.state,
      "skipped",
    );
  });

  test("runs a guarded For range and exposes its index via connected output", async () => {
    const document = graphDocument(
      [
        node("start", "start"),
        node("for", "for", { from: 0, to: 4, step: 1, maxIterations: 10 }),
        node("body", "click", { x: 0, y: 0 }),
        node("end", "end"),
      ],
      [
        ["e1", "start", "for", "next", "in"],
        ["e2", "for", "body", "body", "in"],
        ["e3", "body", "for", "next", "loop"],
        ["e4", "for", "end", "done", "in"],
        ["data-1", "for", "body", "index", "x"],
      ],
    );
    const { service, driver } = serviceFor(document);

    service.start(RUN_INPUT);
    const completed = await waitForTerminal(service);

    assert.equal(completed.state, "completed");
    assert.deepEqual(driver.calls.map((call) => call.data.x), [0, 1, 2, 3]);
    assert.equal(
      completed.steps.find((step) => step.nodeId === "for")?.executionCount,
      5,
    );
    assert.equal(
      completed.steps.find((step) => step.nodeId === "body")?.executionCount,
      4,
    );
  });

  test("runs While and fails clearly when its iteration guard is exceeded", async () => {
    const whileDocument = (condition: boolean, maximum: number) =>
      graphDocument(
        [
          node("start", "start"),
          constantNode("cond", condition),
          node("while", "while", { maxIterations: maximum }),
          node("body", "click", { x: 0, y: 0 }),
          node("end", "end"),
        ],
        [
          ["e1", "start", "while", "next", "in"],
          ["e2", "while", "body", "body", "in"],
          ["e3", "body", "while", "next", "loop"],
          ["e4", "while", "end", "done", "in"],
          ["data-1", "cond", "while", "value", "condition"],
        ],
      );

    const successful = serviceFor(whileDocument(false, 10)).service;
    successful.start(RUN_INPUT);
    const completed = await waitForTerminal(successful);
    assert.equal(completed.state, "completed");
    assert.equal(
      completed.steps.find((step) => step.nodeId === "body")?.executionCount,
      0,
    );

    const guarded = serviceFor(whileDocument(true, 2)).service;
    guarded.start(RUN_INPUT);
    const failed = await waitForTerminal(guarded);
    assert.equal(failed.state, "failed");
    assert.match(failed.error ?? "", /While node.*exceeded 2 iterations/);
    assert.equal(
      failed.steps.find((step) => step.nodeId === "body")?.executionCount,
      2,
    );
  });

  test("fails on unsafe or invalid expressions without invoking the driver", async () => {
    const { service, driver } = serviceFor(
      linearDocument([
        node("calc", "calculate", {
          operation: "expression",
          inputCount: 0,
          expression: "process.exit()",
        }),
      ]),
    );

    service.start(RUN_INPUT);
    const failed = await waitForTerminal(service);
    assert.equal(failed.state, "failed");
    assert.match(failed.error ?? "", /Unexpected|not allowed|token/i);
    assert.deepEqual(driver.calls, []);
  });

  test("expands a connected screen-region into OCR x/y/width/height", async () => {
    const recognition = new FakeRecognition();
    const document = graphDocument(
      [
        node("start", "start"),
        node("region", "screen-region", { x: 10, y: 20, width: 300, height: 150 }),
        node("ocr", "ocr", { x: 0, y: 0, width: 500, height: 200 }),
        node("end", "end"),
      ],
      [
        ["e1", "start", "ocr", "next", "in"],
        ["e2", "ocr", "end", "next", "in"],
        ["data-1", "region", "ocr", "region", "region"],
      ],
    );
    const { service } = serviceFor(document, new FakeDriver(), recognition);

    service.start(RUN_INPUT);
    const completed = await waitForTerminal(service);

    assert.equal(completed.state, "completed");
    assert.deepEqual(recognition.calls, ["ocr"]);
    const received = recognition.nodeData[0] as Record<string, unknown>;
    assert.equal(received.x, 10);
    assert.equal(received.y, 20);
    assert.equal(received.width, 300);
    assert.equal(received.height, 150);
    assert.deepEqual(received.region, { x: 10, y: 20, width: 300, height: 150 });
    assert.equal(
      completed.steps.some((step) => step.nodeId === "region"),
      false,
    );
  });

  test("keeps stored OCR region fields when region input is not connected", async () => {
    const recognition = new FakeRecognition();
    const { service } = serviceFor(
      linearDocument([node("ocr", "ocr", { x: 40, y: 50, width: 120, height: 80 })]),
      new FakeDriver(),
      recognition,
    );

    service.start(RUN_INPUT);
    const completed = await waitForTerminal(service);

    assert.equal(completed.state, "completed");
    const received = recognition.nodeData[0] as Record<string, unknown>;
    assert.equal(received.x, 40);
    assert.equal(received.y, 50);
    assert.equal(received.width, 120);
    assert.equal(received.height, 80);
    assert.equal(received.region, undefined);
  });

  test("pre-seeds screen-region outputs that are not consumed by any node", async () => {
    const document = graphDocument(
      [
        node("start", "start"),
        node("region", "screen-region", { x: 1, y: 2, width: 30, height: 40 }),
        node("end", "end"),
      ],
      [["e1", "start", "end", "next", "in"]],
    );
    const { service } = serviceFor(document);

    service.start(RUN_INPUT);
    const completed = await waitForTerminal(service);

    assert.equal(completed.state, "completed");
    assert.equal(
      completed.steps.some((step) => step.nodeId === "region"),
      false,
    );
  });

  test("fails the run when a screen-region node stores an invalid region", async () => {
    const recognition = new FakeRecognition();
    const document = graphDocument(
      [
        node("start", "start"),
        node("region", "screen-region", { x: 10, y: 20, width: -5, height: 150 }),
        node("ocr", "ocr"),
        node("end", "end"),
      ],
      [
        ["e1", "start", "ocr", "next", "in"],
        ["e2", "ocr", "end", "next", "in"],
        ["data-1", "region", "ocr", "region", "region"],
      ],
    );
    const { service } = serviceFor(document, new FakeDriver(), recognition);

    service.start(RUN_INPUT);
    const failed = await waitForTerminal(service);

    assert.equal(failed.state, "failed");
    assert.match(failed.error ?? "", /finite positive "width"/);
    assert.deepEqual(recognition.calls, []);
  });

  test("pauses before a breakpoint node and resumes with continue", async () => {
    const click = node("click", "click", { x: 1, y: 2 });
    const { service, driver } = serviceFor(linearDocument([click]));

    service.start({ ...RUN_INPUT, breakpoints: ["click"] });
    const paused = await waitForState(service, (run) => run.state === "paused");

    assert.equal(paused.currentNodeId, "click");
    assert.deepEqual(driver.calls, []);

    const resumeResult = service.resume({ runId: "run-1", action: "continue" });
    assert.equal(resumeResult.status, "ok");

    const completed = await waitForState(
      service,
      (run) => run.state === "completed",
    );
    assert.equal(completed.state, "completed");
    assert.deepEqual(driver.calls.map((call) => call.nodeId), ["click"]);
  });

  test("step advances exactly one node before pausing again", async () => {
    const first = node("first", "click", { x: 1, y: 2 });
    const second = node("second", "click", { x: 3, y: 4 });
    const { service, driver } = serviceFor(linearDocument([first, second]));

    service.start({ ...RUN_INPUT, breakpoints: ["first"] });
    const paused = await waitForState(service, (run) => run.state === "paused");
    assert.equal(paused.currentNodeId, "first");

    assert.equal(
      service.resume({ runId: "run-1", action: "step" }).status,
      "ok",
    );
    const nextPause = await waitForState(
      service,
      (run) => run.state === "paused" && run.currentNodeId === "second",
    );
    assert.equal(nextPause.currentNodeId, "second");
    assert.deepEqual(driver.calls.map((call) => call.nodeId), ["first"]);

    assert.equal(
      service.resume({ runId: "run-1", action: "continue" }).status,
      "ok",
    );
    const completed = await waitForState(
      service,
      (run) => run.state === "completed",
    );
    assert.equal(completed.state, "completed");
    assert.deepEqual(driver.calls.map((call) => call.nodeId), [
      "first",
      "second",
    ]);
  });

  test("rejects resume for missing runs or non-paused runs", async () => {
    const click = node("click", "click", { x: 1, y: 2 });
    const { service } = serviceFor(linearDocument([click]));

    assert.deepEqual(service.resume({ runId: "other", action: "continue" }), {
      status: "error",
      error: "run-not-found",
    });

    service.start(RUN_INPUT);
    assert.deepEqual(service.resume({ runId: "run-1", action: "step" }), {
      status: "error",
      error: "run-not-paused",
    });
    await waitForTerminal(service);
  });

  test("emits structured log entries for lifecycle, values, and OCR", async () => {
    const recognition = new FakeRecognition();
    const click = node("click", "click", { x: 1, y: 2 });
    const calc = node("calc", "calculate", {
      operation: "expression",
      inputCount: 0,
      expression: "6 * 7",
    });
    const { service } = serviceFor(
      linearDocument([click, calc]),
      new FakeDriver(),
      recognition,
    );
    const entries: Parameters<Parameters<FlowRuntimeService["subscribeLogs"]>[0]>[0][] =
      [];
    service.subscribeLogs((entry) => entries.push(entry));

    service.start(RUN_INPUT);
    await waitForTerminal(service);

    assert.ok(entries.some((entry) => entry.message === "Flow run started"));
    assert.ok(entries.some((entry) => entry.message === "Flow run completed"));
    assert.ok(
      entries.some(
        (entry) =>
          entry.nodeId === "calc" &&
          entry.message === "Calculated = 42" &&
          entry.data !== null &&
          (entry.data as { value: number }).value === 42,
      ),
    );
    assert.ok(
      entries.some(
        (entry) =>
          entry.nodeId === "click" &&
          entry.level === "debug" &&
          entry.message === "Entering click node",
      ),
    );
  });
});
