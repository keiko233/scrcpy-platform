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
  assignments: FlowRecognitionResult["assignments"] = {
    ocrText: "Ready",
    ocrConfidence: 96,
    ocrMatched: true,
  };
  outputs: FlowRecognitionResult["outputs"] = {
    text: "Ready",
    confidence: 96,
    matched: true,
  };
  disposed = false;

  async recognize(node: FlowNode): Promise<FlowRecognitionResult> {
    this.calls.push(node.id);
    this.nodeData.push(structuredClone(node.data));
    return { assignments: this.assignments, outputs: this.outputs };
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

  test("stores structured OCR assignments for later expressions", async () => {
    const recognition = new FakeRecognition();
    const { service } = serviceFor(
      linearDocument([
        node("ocr", "ocr"),
        node("assert", "assert", {
          condition: "$ocrMatched && $ocrConfidence >= 90",
        }),
      ]),
      new FakeDriver(),
      recognition,
    );

    service.start(RUN_INPUT);
    const completed = await waitForTerminal(service);
    assert.equal(completed.state, "completed");
    assert.deepEqual(completed.variables, recognition.assignments);
    assert.deepEqual(recognition.calls, ["ocr"]);
    await service.dispose();
    assert.equal(recognition.disposed, true);
  });

  test("routes typed OCR outputs into connected downstream inputs", async () => {
    const recognition = new FakeRecognition();
    const document = graphDocument(
      [
        node("start", "start"),
        node("ocr", "ocr"),
        node("if", "if", { condition: "false" }),
        node("true-value", "set-variable", {
          name: "branch",
          expression: '"true"',
        }),
        node("false-value", "set-variable", {
          name: "branch",
          expression: '"false"',
        }),
        node("merge", "merge"),
        node("end", "end"),
      ],
      [
        ["e1", "start", "ocr", "next", "in"],
        ["e2", "ocr", "if", "next", "in"],
        ["data-1", "ocr", "if", "matched", "condition"],
        ["e3", "if", "true-value", "true", "in"],
        ["e4", "if", "false-value", "false", "in"],
        ["e5", "true-value", "merge", "next", "a"],
        ["e6", "false-value", "merge", "next", "b"],
        ["e7", "merge", "end", "next", "in"],
      ],
    );
    const { service } = serviceFor(document, new FakeDriver(), recognition);

    service.start(RUN_INPUT);
    const completed = await waitForTerminal(service);

    assert.equal(completed.state, "completed");
    assert.equal(completed.variables.branch, "true");
    assert.equal(
      completed.steps.find((step) => step.nodeId === "false-value")?.state,
      "skipped",
    );
  });

  test("passes any-typed node outputs as raw connected values", async () => {
    const document = linearDocument([
      node("source", "set-variable", { name: "source", expression: "6 * 7" }),
      node("target", "set-variable", { name: "target", expression: "0" }),
      node("assert", "assert", { condition: "$target == 42" }),
    ]);
    document.edges.push({
      id: "data-1",
      source: "source",
      target: "target",
      sourceHandle: "value",
      targetHandle: "expression",
    });
    const { service } = serviceFor(document);

    service.start(RUN_INPUT);
    const completed = await waitForTerminal(service);

    assert.equal(completed.state, "completed");
    assert.equal(completed.variables.target, 42);
  });

  test("aggregates expressions and stores the result variable", async () => {
    const document = linearDocument([
      node("seed-a", "set-variable", { name: "a", expression: "4" }),
      node("seed-b", "set-variable", { name: "b", expression: "9" }),
      node("calc", "calculate", {
        operation: "max",
        values: "$a, $b, 2",
        variable: "result",
      }),
      node("assert", "assert", { condition: "$result == 9" }),
    ]);
    const { service } = serviceFor(document);

    service.start(RUN_INPUT);
    const completed = await waitForTerminal(service);

    assert.equal(completed.state, "completed");
    assert.deepEqual(completed.variables, { a: 4, b: 9, result: 9 });
  });

  test("counts values supplied through a connected data input", async () => {
    const document = graphDocument(
      [
        node("start", "start"),
        node("source", "set-variable", { name: "raw", expression: "1" }),
        node("calc", "calculate", { operation: "count", values: "", variable: "n" }),
        node("assert", "assert", { condition: "$n == 1" }),
        node("end", "end"),
      ],
      [
        ["e1", "start", "source", "next", "in"],
        ["e2", "source", "calc", "next", "in"],
        ["data-1", "source", "calc", "value", "values"],
        ["e3", "calc", "assert", "next", "in"],
        ["e4", "assert", "end", "next", "in"],
      ],
    );
    const { service } = serviceFor(document);

    service.start(RUN_INPUT);
    const completed = await waitForTerminal(service);

    assert.equal(completed.state, "completed");
    assert.equal(completed.variables.n, 1);
  });

  test("casts OCR text to a number before aggregating", async () => {
    const recognition = new FakeRecognition();
    recognition.assignments = {
      ocrText: "96",
      ocrConfidence: 96,
      ocrMatched: true,
    };
    const document = linearDocument([
      node("ocr", "ocr"),
      node("calc", "calculate", {
        operation: "max",
        values: "number($ocrText), 10",
        variable: "result",
      }),
      node("assert", "assert", { condition: "$result == 96" }),
    ]);
    const { service } = serviceFor(document, new FakeDriver(), recognition);

    service.start(RUN_INPUT);
    const completed = await waitForTerminal(service);

    assert.equal(completed.state, "completed");
    assert.equal(completed.variables.result, 96);
  });

  test("converts a connected OCR text value before calculating", async () => {
    const recognition = new FakeRecognition();
    recognition.assignments = {
      ocrText: "96",
      ocrConfidence: 96,
      ocrMatched: true,
    };
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
        node("calc", "calculate", { operation: "max", values: "", variable: "result" }),
        node("assert", "assert", { condition: "$result == 96" }),
        node("end", "end"),
      ],
      [
        ["e1", "start", "ocr", "next", "in"],
        ["e2", "ocr", "convert", "next", "in"],
        ["data-1", "ocr", "convert", "text", "value"],
        ["e3", "convert", "calc", "next", "in"],
        ["data-2", "convert", "calc", "value", "values"],
        ["e4", "calc", "assert", "next", "in"],
        ["e5", "assert", "end", "next", "in"],
      ],
    );
    const { service } = serviceFor(document, new FakeDriver(), recognition);

    service.start(RUN_INPUT);
    const completed = await waitForTerminal(service);

    assert.equal(completed.state, "completed");
    assert.equal(completed.variables.result, 96);
  });

  test("overrides action fields with connected typed input values", async () => {
    const document = linearDocument([
      node("source", "set-variable", { name: "coordinate", expression: "17" }),
      node("click", "click", { x: 1, y: 2 }),
    ]);
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

  test("evaluates variables, takes one If branch, merges, and asserts", async () => {
    const document = graphDocument(
      [
        node("start", "start"),
        node("seed", "set-variable", { name: "count", expression: "3" }),
        node("if", "if", { condition: "$count >= 3" }),
        node("true-value", "set-variable", {
          name: "result",
          expression: "$count * 14",
        }),
        node("false-value", "set-variable", {
          name: "result",
          expression: "0",
        }),
        node("merge", "merge"),
        node("assert", "assert", {
          condition: "$result == 42",
          message: "unexpected result",
        }),
        node("end", "end"),
      ],
      [
        ["e1", "start", "seed", "next", "in"],
        ["e2", "seed", "if", "next", "in"],
        ["e3", "if", "true-value", "true", "in"],
        ["e4", "if", "false-value", "false", "in"],
        ["e5", "true-value", "merge", "next", "a"],
        ["e6", "false-value", "merge", "next", "b"],
        ["e7", "merge", "assert", "next", "in"],
        ["e8", "assert", "end", "next", "in"],
      ],
    );
    const { service } = serviceFor(document);

    service.start(RUN_INPUT);
    const completed = await waitForTerminal(service);

    assert.equal(completed.state, "completed");
    assert.deepEqual(completed.variables, { count: 3, result: 42 });
    assert.equal(
      completed.steps.find((step) => step.nodeId === "false-value")?.state,
      "skipped",
    );
    assert.equal(
      completed.steps.find((step) => step.nodeId === "true-value")
        ?.executionCount,
      1,
    );
  });

  test("runs a guarded For range and exposes its final variables", async () => {
    const document = graphDocument(
      [
        node("start", "start"),
        node("seed", "set-variable", { name: "sum", expression: "0" }),
        node("for", "for", {
          variable: "i",
          from: "0",
          to: "4",
          step: "1",
          maxIterations: 10,
        }),
        node("body", "set-variable", {
          name: "sum",
          expression: "$sum + $i",
        }),
        node("assert", "assert", { condition: "$sum == 6" }),
        node("end", "end"),
      ],
      [
        ["e1", "start", "seed", "next", "in"],
        ["e2", "seed", "for", "next", "in"],
        ["e3", "for", "body", "body", "in"],
        ["e4", "body", "for", "next", "loop"],
        ["e5", "for", "assert", "done", "in"],
        ["e6", "assert", "end", "next", "in"],
      ],
    );
    const { service } = serviceFor(document);

    service.start(RUN_INPUT);
    const completed = await waitForTerminal(service);

    assert.equal(completed.state, "completed");
    assert.deepEqual(completed.variables, { sum: 6, i: 3 });
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
    const whileDocument = (condition: string, maximum: number) =>
      graphDocument(
        [
          node("start", "start"),
          node("seed", "set-variable", { name: "count", expression: "0" }),
          node("while", "while", {
            condition,
            maxIterations: maximum,
          }),
          node("body", "set-variable", {
            name: "count",
            expression: "$count + 1",
          }),
          node("assert", "assert", { condition: "$count == 3" }),
          node("end", "end"),
        ],
        [
          ["e1", "start", "seed", "next", "in"],
          ["e2", "seed", "while", "next", "in"],
          ["e3", "while", "body", "body", "in"],
          ["e4", "body", "while", "next", "loop"],
          ["e5", "while", "assert", "done", "in"],
          ["e6", "assert", "end", "next", "in"],
        ],
      );

    const successful = serviceFor(whileDocument("$count < 3", 10)).service;
    successful.start(RUN_INPUT);
    const completed = await waitForTerminal(successful);
    assert.equal(completed.state, "completed");
    assert.equal(completed.variables.count, 3);
    assert.equal(
      completed.steps.find((step) => step.nodeId === "body")?.executionCount,
      3,
    );

    const guarded = serviceFor(whileDocument("true", 2)).service;
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
        node("set", "set-variable", {
          name: "value",
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

  test("rejects variable names that could mutate an object prototype", async () => {
    const { service } = serviceFor(
      linearDocument([
        node("set", "set-variable", {
          name: "__proto__",
          expression: "1",
        }),
      ]),
    );

    service.start(RUN_INPUT);
    const failed = await waitForTerminal(service);
    assert.equal(failed.state, "failed");
    assert.match(failed.error ?? "", /invalid variable name/);
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
    const set = node("set", "set-variable", { name: "answer", expression: "6 * 7" });
    const { service } = serviceFor(
      linearDocument([click, set]),
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
          entry.nodeId === "set" &&
          entry.message === "Set answer = 42" &&
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
