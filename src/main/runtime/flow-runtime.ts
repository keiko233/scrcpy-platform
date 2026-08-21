import { compileFlow } from "../../shared/flow-graph";
import type { FlowNode, ScriptDto } from "../../shared/project-contracts";
import type {
  FlowRunDto,
  FlowRunListener,
  FlowRunStepDto,
  StartFlowRunInput,
  StartFlowRunResult,
  StopFlowRunInput,
  StopFlowRunResult,
} from "../../shared/run-contracts";

export interface FlowScriptRepository {
  getScript(input: { scriptId: string }): ScriptDto | null;
}

export interface FlowRunTarget {
  deviceId: string;
  sessionId: string;
}

export interface FlowActionContext extends FlowRunTarget {
  runId: string;
  displayId: number;
}

export interface FlowActionDriver {
  getTarget(): FlowRunTarget | null;
  execute(
    node: FlowNode,
    context: FlowActionContext,
    signal: AbortSignal,
  ): Promise<void>;
}

export interface FlowRuntimeOptions {
  createRunId?: () => string;
  now?: () => string;
}

class RunCancelledError extends Error {
  constructor() {
    super("Flow run cancelled.");
    this.name = "RunCancelledError";
  }
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function cloneRun(run: FlowRunDto): FlowRunDto {
  return {
    ...run,
    steps: run.steps.map((step) => ({ ...step })),
  };
}

function abortIfNeeded(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new RunCancelledError();
  }
}

function nonnegativeDuration(value: unknown, nodeId: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Delay node "${nodeId}" requires a finite nonnegative ms value.`);
  }
  return Math.round(value);
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  abortIfNeeded(signal);
  if (ms === 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    timer.unref();
    const onAbort = () => {
      clearTimeout(timer);
      reject(new RunCancelledError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export class FlowRuntimeService {
  readonly #repository: FlowScriptRepository;
  readonly #driver: FlowActionDriver;
  readonly #createRunId: () => string;
  readonly #now: () => string;
  readonly #listeners = new Set<FlowRunListener>();
  #run: FlowRunDto | null = null;
  #abortController: AbortController | null = null;
  #execution: Promise<void> | null = null;

  constructor(
    repository: FlowScriptRepository,
    driver: FlowActionDriver,
    options: FlowRuntimeOptions = {},
  ) {
    this.#repository = repository;
    this.#driver = driver;
    this.#createRunId =
      options.createRunId ?? (() => `run-${crypto.randomUUID()}`);
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  subscribe(listener: FlowRunListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  getRun(): FlowRunDto | null {
    return this.#run === null ? null : cloneRun(this.#run);
  }

  start(input: StartFlowRunInput): StartFlowRunResult {
    if (this.#run?.state === "running") {
      return { status: "error", error: "run-busy" };
    }

    const script = this.#repository.getScript({ scriptId: input.scriptId });
    if (script === null) {
      return { status: "error", error: "script-not-found" };
    }

    const target = this.#driver.getTarget();
    if (target === null) {
      return { status: "error", error: "device-not-connected" };
    }
    if (target.deviceId !== input.deviceId) {
      return { status: "error", error: "device-mismatch" };
    }
    if (target.sessionId !== input.sessionId) {
      return { status: "error", error: "session-mismatch" };
    }

    const compiled = compileFlow(
      script.draftDocument.nodes,
      script.draftDocument.edges,
    );
    if (!compiled.valid) {
      return {
        status: "error",
        error: "invalid-flow",
        issues: compiled.issues,
      };
    }

    const nodeById = new Map(
      script.draftDocument.nodes.map((node) => [node.id, node]),
    );
    const orderedNodes = compiled.order.map((nodeId) => {
      const node = nodeById.get(nodeId);
      if (node === undefined) {
        throw new Error(`Compiled flow references missing node "${nodeId}".`);
      }
      return node;
    });
    const runId = this.#createRunId();
    const startedAt = this.#now();
    const steps: FlowRunStepDto[] = orderedNodes.map((node) => ({
      nodeId: node.id,
      kind: node.type,
      state: "pending",
      startedAt: null,
      finishedAt: null,
      error: null,
    }));
    this.#run = {
      runId,
      scriptId: input.scriptId,
      deviceId: input.deviceId,
      sessionId: input.sessionId,
      displayId: input.displayId,
      state: "running",
      currentNodeId: null,
      startedAt,
      finishedAt: null,
      error: null,
      steps,
    };
    const controller = new AbortController();
    this.#abortController = controller;
    this.#publish();
    this.#execution = this.#execute(orderedNodes, controller.signal).finally(
      () => {
        if (this.#abortController === controller) {
          this.#abortController = null;
          this.#execution = null;
        }
      },
    );
    return { status: "ok", run: cloneRun(this.#run) };
  }

  async stop(input: StopFlowRunInput): Promise<StopFlowRunResult> {
    const run = this.#run;
    if (run === null || run.runId !== input.runId) {
      return { status: "error", error: "run-not-found" };
    }
    if (run.state === "running") {
      this.#abortController?.abort();
      await this.#execution;
    }
    return { status: "ok", run: cloneRun(this.#run as FlowRunDto) };
  }

  async cancelCurrent(): Promise<void> {
    const run = this.#run;
    if (run?.state !== "running") {
      return;
    }
    await this.stop({ runId: run.runId });
  }

  async dispose(): Promise<void> {
    await this.cancelCurrent();
    this.#listeners.clear();
  }

  async #execute(nodes: FlowNode[], signal: AbortSignal): Promise<void> {
    const run = this.#run as FlowRunDto;
    const context: FlowActionContext = {
      runId: run.runId,
      deviceId: run.deviceId,
      sessionId: run.sessionId,
      displayId: run.displayId,
    };

    try {
      for (let index = 0; index < nodes.length; index += 1) {
        abortIfNeeded(signal);
        const node = nodes[index];
        const step = run.steps[index];
        step.state = "running";
        step.startedAt = this.#now();
        run.currentNodeId = node.id;
        this.#publish();

        await this.#executeNode(node, context, signal);
        abortIfNeeded(signal);
        step.state = "completed";
        step.finishedAt = this.#now();
        run.currentNodeId = null;
        this.#publish();
      }
      run.state = "completed";
      run.finishedAt = this.#now();
      this.#publish();
    } catch (error) {
      const cancelled = signal.aborted || error instanceof RunCancelledError;
      const finishedAt = this.#now();
      const currentStep = run.steps.find((step) => step.state === "running");
      if (currentStep !== undefined) {
        currentStep.state = cancelled ? "cancelled" : "failed";
        currentStep.finishedAt = finishedAt;
        currentStep.error = cancelled ? null : errorMessageOf(error);
      }
      if (cancelled) {
        for (const step of run.steps) {
          if (step.state === "pending") {
            step.state = "cancelled";
            step.finishedAt = finishedAt;
          }
        }
      }
      run.state = cancelled ? "cancelled" : "failed";
      run.currentNodeId = null;
      run.finishedAt = finishedAt;
      run.error = cancelled ? null : errorMessageOf(error);
      this.#publish();
    }
  }

  async #executeNode(
    node: FlowNode,
    context: FlowActionContext,
    signal: AbortSignal,
  ): Promise<void> {
    switch (node.type) {
      case "start":
      case "end":
        return;
      case "delay":
        await abortableDelay(
          nonnegativeDuration(node.data.ms, node.id),
          signal,
        );
        return;
      case "ocr":
        throw new Error(
          `OCR node "${node.id}" is not supported by this runtime batch.`,
        );
      case "click":
      case "swipe":
      case "launch-app":
        await this.#driver.execute(node, context, signal);
        return;
    }
  }

  #publish(): void {
    if (this.#run === null) {
      return;
    }
    const snapshot = cloneRun(this.#run);
    for (const listener of this.#listeners) {
      try {
        listener(cloneRun(snapshot));
      } catch {
        // A broken observer must never stop a background run.
      }
    }
  }
}
