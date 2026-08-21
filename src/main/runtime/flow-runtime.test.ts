import assert from "node:assert/strict";
import { describe, test } from "node:test";

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
  readonly calls: Array<{ nodeId: string; context: FlowActionContext }> = [];
  error: Error | null = null;

  getTarget(): FlowRunTarget | null {
    return this.target;
  }

  async execute(
    action: FlowNode,
    context: FlowActionContext,
    signal: AbortSignal,
  ): Promise<void> {
    this.calls.push({ nodeId: action.id, context });
    if (signal.aborted) {
      throw new Error("aborted");
    }
    if (this.error !== null) {
      throw this.error;
    }
  }
}

const RUN_INPUT = {
  scriptId: "script-1",
  deviceId: "device-1",
  sessionId: "session-1",
  displayId: 4,
} as const;

function serviceFor(document: FlowDocument, driver = new FakeDriver()) {
  const repository = {
    getScript: ({ scriptId }: { scriptId: string }) =>
      scriptId === "script-1" ? script(document) : null,
  };
  const service = new FlowRuntimeService(repository, driver, {
    createRunId: () => "run-1",
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

  test("reports OCR as unsupported in this runtime batch", async () => {
    const { service } = serviceFor(linearDocument([node("ocr", "ocr")]));
    service.start(RUN_INPUT);
    const failed = await waitForTerminal(service);
    assert.equal(failed.state, "failed");
    assert.match(failed.error ?? "", /OCR node.*not supported/);
  });
});
