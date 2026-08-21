import { compileFlow } from "../../shared/flow-graph";
import { evaluateExpression, expressionTruthy } from "../../shared/expression";
import {
  FLOW_NODE_PORTS,
  type FlowDocument,
  type FlowEdge,
  type FlowNode,
  type JsonValue,
  type ScriptDto,
} from "../../shared/project-contracts";
import type {
  FlowRunDto,
  FlowRunListener,
  FlowRunStepDto,
  StartFlowRunInput,
  StartFlowRunResult,
  StopFlowRunInput,
  StopFlowRunResult,
} from "../../shared/run-contracts";
import type { FlowRecognitionDriver } from "./flow-recognition";

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
  recognition?: FlowRecognitionDriver;
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
    variables: structuredClone(run.variables),
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

function requiredString(
  node: FlowNode,
  field: string,
  options: { trim?: boolean } = {},
): string {
  const value = node.data[field];
  if (typeof value !== "string") {
    throw new Error(`Node "${node.id}" requires string field "${field}".`);
  }
  const normalized = options.trim ? value.trim() : value;
  if (normalized.length === 0) {
    throw new Error(`Node "${node.id}" requires nonempty field "${field}".`);
  }
  return normalized;
}

const RESERVED_VARIABLE_NAMES = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

function isSafeVariableName(name: string): boolean {
  return (
    /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name) &&
    !RESERVED_VARIABLE_NAMES.has(name)
  );
}

function variableName(node: FlowNode, field = "name"): string {
  const name = requiredString(node, field, { trim: true });
  if (!isSafeVariableName(name)) {
    throw new Error(
      `Node "${node.id}" has invalid variable name "${name}".`,
    );
  }
  return name;
}

function maximumIterations(node: FlowNode): number {
  const value = node.data.maxIterations;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 100_000
  ) {
    throw new Error(
      `Node "${node.id}" requires maxIterations between 1 and 100000.`,
    );
  }
  return value;
}

function numericExpression(
  node: FlowNode,
  field: string,
  variables: Readonly<Record<string, JsonValue>>,
): number {
  const result = evaluateExpression(requiredString(node, field), variables);
  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new Error(
      `Expression "${field}" on node "${node.id}" must return a finite number.`,
    );
  }
  return result;
}

function resolvedPort(
  declared: readonly string[],
  persisted: string | undefined,
): string {
  return persisted ?? (declared.length === 1 ? declared[0] : "");
}

interface ForLoopState {
  variable: string;
  current: number;
  to: number;
  step: number;
  iterations: number;
  maximum: number;
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
  readonly #recognition: FlowRecognitionDriver | null;
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
    this.#recognition = options.recognition ?? null;
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
      executionCount: 0,
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
      variables: {},
      steps,
    };
    const controller = new AbortController();
    this.#abortController = controller;
    this.#publish();
    this.#execution = this.#execute(
      script.draftDocument,
      orderedNodes[0]?.id ?? "",
      controller.signal,
    ).finally(
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
    await this.#recognition?.dispose();
    this.#listeners.clear();
  }

  async #execute(
    document: FlowDocument,
    startNodeId: string,
    signal: AbortSignal,
  ): Promise<void> {
    const run = this.#run as FlowRunDto;
    const context: FlowActionContext = {
      runId: run.runId,
      deviceId: run.deviceId,
      sessionId: run.sessionId,
      displayId: run.displayId,
    };

    const nodes = new Map(document.nodes.map((node) => [node.id, node]));
    const steps = new Map(run.steps.map((step) => [step.nodeId, step]));
    const outgoing = new Map<string, FlowEdge[]>();
    for (const edge of document.edges) {
      const list = outgoing.get(edge.source);
      if (list) list.push(edge);
      else outgoing.set(edge.source, [edge]);
    }
    const forLoops = new Map<string, ForLoopState>();
    const whileIterations = new Map<string, number>();
    let currentNodeId: string | null = startNodeId;
    let arrivalPort: string | null = null;
    let transitions = 0;

    try {
      while (currentNodeId !== null) {
        transitions += 1;
        if (transitions > 100_000) {
          throw new Error("Flow exceeded the maximum of 100000 node transitions.");
        }
        abortIfNeeded(signal);
        const node = nodes.get(currentNodeId);
        const step = steps.get(currentNodeId);
        if (node === undefined || step === undefined) {
          throw new Error(`Flow reached missing node "${currentNodeId}".`);
        }
        step.state = "running";
        step.startedAt = this.#now();
        step.finishedAt = null;
        step.error = null;
        step.executionCount += 1;
        run.currentNodeId = node.id;
        this.#publish();

        const outputPort = await this.#executeNode(
          node,
          arrivalPort,
          context,
          signal,
          run.variables,
          forLoops,
          whileIterations,
        );
        abortIfNeeded(signal);
        step.state = "completed";
        step.finishedAt = this.#now();
        run.currentNodeId = null;
        this.#publish();

        if (outputPort === null) {
          currentNodeId = null;
          continue;
        }
        const declaredOutputs: readonly string[] =
          FLOW_NODE_PORTS[node.type].outputs;
        const edge = (outgoing.get(node.id) ?? []).find(
          (candidate) =>
            resolvedPort(declaredOutputs, candidate.sourceHandle) === outputPort,
        );
        if (edge === undefined) {
          throw new Error(
            `Node "${node.id}" has no edge for output port "${outputPort}".`,
          );
        }
        const target = nodes.get(edge.target);
        if (target === undefined) {
          throw new Error(`Edge "${edge.id}" targets missing node "${edge.target}".`);
        }
        currentNodeId = target.id;
        arrivalPort = resolvedPort(
          FLOW_NODE_PORTS[target.type].inputs,
          edge.targetHandle,
        );
      }
      const finishedAt = this.#now();
      for (const step of run.steps) {
        if (step.state === "pending") {
          step.state = "skipped";
          step.finishedAt = finishedAt;
        }
      }
      run.state = "completed";
      run.finishedAt = finishedAt;
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
    arrivalPort: string | null,
    context: FlowActionContext,
    signal: AbortSignal,
    variables: Record<string, JsonValue>,
    forLoops: Map<string, ForLoopState>,
    whileIterations: Map<string, number>,
  ): Promise<string | null> {
    switch (node.type) {
      case "start":
        return "next";
      case "end":
        return null;
      case "delay":
        await abortableDelay(
          nonnegativeDuration(node.data.ms, node.id),
          signal,
        );
        return "next";
      case "ocr":
        if (this.#recognition === null) {
          throw new Error(`OCR node "${node.id}" has no recognition driver.`);
        }
        for (const [name, value] of Object.entries(
          (await this.#recognition.recognize(node, context, signal)).assignments,
        )) {
          if (!isSafeVariableName(name)) {
            throw new Error(
              `OCR node "${node.id}" returned invalid variable name "${name}".`,
            );
          }
          variables[name] = value;
        }
        return "next";
      case "click":
      case "swipe":
      case "launch-app":
        await this.#driver.execute(node, context, signal);
        return "next";
      case "set-variable": {
        const name = variableName(node);
        variables[name] = evaluateExpression(
          requiredString(node, "expression"),
          variables,
        );
        return "next";
      }
      case "if":
        return expressionTruthy(
          evaluateExpression(requiredString(node, "condition"), variables),
        )
          ? "true"
          : "false";
      case "merge":
        return "next";
      case "assert": {
        const passed = expressionTruthy(
          evaluateExpression(requiredString(node, "condition"), variables),
        );
        if (!passed) {
          const message = node.data.message;
          throw new Error(
            typeof message === "string" && message.trim().length > 0
              ? message.trim()
              : `Assertion node "${node.id}" failed.`,
          );
        }
        return "next";
      }
      case "for": {
        let loop = forLoops.get(node.id);
        if (arrivalPort === "in") {
          const step = numericExpression(node, "step", variables);
          if (step === 0) {
            throw new Error(`For node "${node.id}" step cannot be zero.`);
          }
          loop = {
            variable: variableName(node, "variable"),
            current: numericExpression(node, "from", variables),
            to: numericExpression(node, "to", variables),
            step,
            iterations: 0,
            maximum: maximumIterations(node),
          };
          forLoops.set(node.id, loop);
        } else if (arrivalPort === "loop" && loop !== undefined) {
          loop.current += loop.step;
        } else {
          throw new Error(
            `For node "${node.id}" was entered through invalid port "${arrivalPort ?? "(none)"}".`,
          );
        }
        const continues =
          loop.step > 0 ? loop.current < loop.to : loop.current > loop.to;
        if (!continues) {
          forLoops.delete(node.id);
          return "done";
        }
        if (loop.iterations >= loop.maximum) {
          throw new Error(
            `For node "${node.id}" exceeded ${loop.maximum} iterations.`,
          );
        }
        loop.iterations += 1;
        variables[loop.variable] = loop.current;
        return "body";
      }
      case "while": {
        if (arrivalPort !== "in" && arrivalPort !== "loop") {
          throw new Error(
            `While node "${node.id}" was entered through invalid port "${arrivalPort ?? "(none)"}".`,
          );
        }
        const continues = expressionTruthy(
          evaluateExpression(requiredString(node, "condition"), variables),
        );
        if (!continues) {
          whileIterations.delete(node.id);
          return "done";
        }
        const iterations = whileIterations.get(node.id) ?? 0;
        const maximum = maximumIterations(node);
        if (iterations >= maximum) {
          throw new Error(
            `While node "${node.id}" exceeded ${maximum} iterations.`,
          );
        }
        whileIterations.set(node.id, iterations + 1);
        return "body";
      }
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
