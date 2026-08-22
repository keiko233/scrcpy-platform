import { compileFlow } from "../../shared/flow-graph";
import {
  aggregateValues,
  castValue,
  evaluateExpression,
  expressionTruthy,
  type AggregateOperation,
  type CastTarget,
} from "../../shared/expression";
import {
  FLOW_NODE_DATA_PORTS,
  FLOW_NODE_PORTS,
  ScreenRegionSchema,
  flowDataInputPorts,
  resolveFlowPort,
  type FlowDocument,
  type FlowDataType,
  type FlowEdge,
  type FlowNode,
  type JsonValue,
  type ScreenRegion,
  type ScriptDto,
} from "../../shared/project-contracts";
import type {
  FlowRunDto,
  FlowRunListener,
  FlowRunLogEntryDto,
  FlowRunLogLevel,
  FlowRunLogListener,
  FlowRunStepDto,
  ResumeFlowRunInput,
  ResumeFlowRunResult,
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

function formatLogValue(value: JsonValue): string {
  try {
    const text = JSON.stringify(value);
    return text === undefined ? String(value) : text;
  } catch {
    return String(value);
  }
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

function finiteNumberInput(node: FlowNode, field: string): number {
  const value = node.data[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `Data input "${field}" on node "${node.id}" must be a finite number.`,
    );
  }
  return value;
}

function calculateOperation(node: FlowNode): AggregateOperation | "expression" {
  const operation = requiredString(node, "operation", { trim: true });
  const operations: readonly (AggregateOperation | "expression")[] = [
    "max",
    "min",
    "sum",
    "avg",
    "count",
    "expression",
  ];
  if (!operations.includes(operation as AggregateOperation | "expression")) {
    throw new Error(
      `Calculate node "${node.id}" has unsupported operation "${operation}".`,
    );
  }
  return operation as AggregateOperation | "expression";
}

function calculateInputEntries(
  node: FlowNode,
  connectedInputs: ReadonlySet<string>,
): ReadonlyArray<readonly [string, JsonValue]> {
  return flowDataInputPorts(node.type, node.data)
    .filter((port) => connectedInputs.has(port.id))
    .map((port) => [port.id, node.data[port.id] as JsonValue] as const);
}

function calculateValues(
  node: FlowNode,
  connectedInputs: ReadonlySet<string>,
): JsonValue[] {
  return calculateInputEntries(node, connectedInputs).map(([, value]) => value);
}

const CAST_TARGETS: readonly CastTarget[] = [
  "number",
  "int",
  "string",
  "boolean",
];

function convertNodeValue(node: FlowNode): JsonValue {
  const toType = requiredString(node, "toType", { trim: true });
  if (!CAST_TARGETS.includes(toType as CastTarget)) {
    throw new Error(
      `Convert node "${node.id}" has unsupported target "${toType}".`,
    );
  }
  if (node.data.value === undefined) {
    throw new Error(`Convert node "${node.id}" requires a connected value.`);
  }
  return castValue(toType as CastTarget, node.data.value);
}

function getFieldOrInputValue(
  node: FlowNode,
  field: string,
  connectedInputs: ReadonlySet<string>,
  variables: Readonly<Record<string, JsonValue>>,
): JsonValue {
  if (connectedInputs.has(field)) {
    const value = node.data[field];
    if (value === undefined) {
      throw new Error(`Data input "${field}" on node "${node.id}" is missing.`);
    }
    return value as JsonValue;
  }
  const raw = node.data[field];
  if (typeof raw === "number" || typeof raw === "boolean" || raw === null) {
    return raw as JsonValue;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new Error(`Node "${node.id}" requires nonempty field "${field}".`);
    }
    return evaluateExpression(trimmed, variables);
  }
  throw new Error(`Node "${node.id}" requires field "${field}".`);
}

function compareWithOperator(
  operator: string,
  left: JsonValue,
  right: JsonValue,
  nodeId: string,
): boolean {
  switch (operator) {
    case ">":
    case ">=":
    case "<":
    case "<=": {
      if (typeof left === "number" && typeof right === "number") {
        if (operator === ">") return left > right;
        if (operator === ">=") return left >= right;
        if (operator === "<") return left < right;
        return left <= right;
      }
      if (typeof left === "string" && typeof right === "string") {
        if (operator === ">") return left > right;
        if (operator === ">=") return left >= right;
        if (operator === "<") return left < right;
        return left <= right;
      }
      // Try numeric coercion for string numbers
      const leftNum = typeof left === "string" ? Number(left.trim()) : NaN;
      const rightNum = typeof right === "string" ? Number(right.trim()) : NaN;
      const leftIsNumeric = typeof left === "string" && left.trim() !== "" && Number.isFinite(leftNum);
      const rightIsNumeric = typeof right === "string" && right.trim() !== "" && Number.isFinite(rightNum);
      if (typeof left === "number" && rightIsNumeric) {
        if (operator === ">") return left > rightNum;
        if (operator === ">=") return left >= rightNum;
        if (operator === "<") return left < rightNum;
        return left <= rightNum;
      }
      if (leftIsNumeric && typeof right === "number") {
        if (operator === ">") return leftNum > right;
        if (operator === ">=") return leftNum >= right;
        if (operator === "<") return leftNum < right;
        return leftNum <= right;
      }
      if (leftIsNumeric && rightIsNumeric) {
        if (operator === ">") return leftNum > rightNum;
        if (operator === ">=") return leftNum >= rightNum;
        if (operator === "<") return leftNum < rightNum;
        return leftNum <= rightNum;
      }
      throw new Error(
        `Compare node "${nodeId}" operator "${operator}" requires both numbers or both strings.`,
      );
    }
    case "==":
    case "===":
      return left === right;
    case "!=":
    case "!==":
      return left !== right;
    case "contains": {
      if (typeof left === "string" && typeof right === "string") return left.includes(right);
      if (Array.isArray(left)) return left.includes(right);
      throw new Error(`Compare node "${nodeId}" operator "contains" requires string or array.`);
    }
    case "notContains": {
      if (typeof left === "string" && typeof right === "string") return !left.includes(right);
      if (Array.isArray(left)) return !left.includes(right);
      throw new Error(`Compare node "${nodeId}" operator "notContains" requires string or array.`);
    }
    default:
      throw new Error(`Node "${nodeId}" has unsupported operator "${operator}".`);
  }
}

function isCompareMode(node: FlowNode): boolean {
  const op = node.data.operator;
  return typeof op === "string" && op.trim() !== "" && op.trim() !== "expression";
}

function finiteNonnegative(value: unknown, nodeId: string, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Node "${nodeId}" requires a finite nonnegative "${field}" value.`);
  }
  return value;
}

function finitePositive(value: unknown, nodeId: string, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Node "${nodeId}" requires a finite positive "${field}" value.`);
  }
  return value;
}

function screenRegionValue(node: FlowNode): ScreenRegion {
  return {
    x: finiteNonnegative(node.data.x, node.id, "x"),
    y: finiteNonnegative(node.data.y, node.id, "y"),
    width: finitePositive(node.data.width, node.id, "width"),
    height: finitePositive(node.data.height, node.id, "height"),
  };
}

function withExpandedRegion(node: FlowNode): FlowNode {
  const parsed = ScreenRegionSchema.safeParse(node.data.region);
  if (!parsed.success) {
    throw new Error(
      `Data input "region" on node "${node.id}" must be a region object.`,
    );
  }
  const { x, y, width, height } = parsed.data;
  return {
    ...node,
    data: {
      ...node.data,
      x: finiteNonnegative(x, node.id, "x"),
      y: finiteNonnegative(y, node.id, "y"),
      width: finitePositive(width, node.id, "width"),
      height: finitePositive(height, node.id, "height"),
    },
  };
}

function resolvedPort(
  declared: readonly string[],
  persisted: string | undefined,
): string {
  return persisted ?? (declared.length === 1 ? declared[0] : "");
}

interface NodeExecutionResult {
  flowPort: string | null;
  outputs: Record<string, JsonValue>;
}

interface ResolvedNodeInputs {
  node: FlowNode;
  connected: ReadonlySet<string>;
}

function executionResult(
  flowPort: string | null,
  outputs: Record<string, JsonValue> = {},
): NodeExecutionResult {
  return { flowPort, outputs };
}

function dataValueKey(nodeId: string, portId: string): string {
  return `${nodeId}\u0000${portId}`;
}

function matchesDataType(value: JsonValue, type: FlowDataType): boolean {
  switch (type) {
    case "any":
      return true;
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "screen-region":
      return ScreenRegionSchema.safeParse(value).success;
  }
}

function resolveNodeInputs(
  node: FlowNode,
  incomingEdges: readonly FlowEdge[],
  nodes: ReadonlyMap<string, FlowNode>,
  values: ReadonlyMap<string, JsonValue>,
): ResolvedNodeInputs {
  const data = { ...node.data };
  const connected = new Set<string>();
  for (const edge of incomingEdges) {
    const source = nodes.get(edge.source);
    if (source === undefined) {
      throw new Error(`Data edge "${edge.id}" references missing source node.`);
    }
    const sourcePort = resolveFlowPort(
      source.type,
      "output",
      edge.sourceHandle,
      source.data,
    );
    const targetPort = resolveFlowPort(
      node.type,
      "input",
      edge.targetHandle,
      node.data,
    );
    if (sourcePort?.role !== "data" || targetPort?.role !== "data") {
      throw new Error(`Data edge "${edge.id}" has invalid typed ports.`);
    }
    const key = dataValueKey(source.id, sourcePort.id);
    if (!values.has(key)) {
      throw new Error(
        `Data input "${node.id}.${targetPort.id}" was read before output "${source.id}.${sourcePort.id}" was produced.`,
      );
    }
    const value = values.get(key) as JsonValue;
    if (!matchesDataType(value, targetPort.dataType)) {
      throw new Error(
        `Data input "${node.id}.${targetPort.id}" expected ${targetPort.dataType}, but "${source.id}.${sourcePort.id}" produced ${typeof value}.`,
      );
    }
    data[targetPort.field ?? targetPort.id] = structuredClone(value);
    connected.add(targetPort.id);
  }
  return {
    node: { ...node, data },
    connected,
  };
}

function storeNodeOutputs(
  node: FlowNode,
  outputs: Readonly<Record<string, JsonValue>>,
  values: Map<string, JsonValue>,
): void {
  const declared = FLOW_NODE_DATA_PORTS[node.type].outputs;
  for (const port of declared) {
    if (!Object.hasOwn(outputs, port.id)) {
      throw new Error(
        `Node "${node.id}" did not produce declared output "${port.id}".`,
      );
    }
    const value = outputs[port.id];
    if (!matchesDataType(value, port.dataType)) {
      throw new Error(
        `Node "${node.id}" output "${port.id}" must be ${port.dataType}.`,
      );
    }
    values.set(dataValueKey(node.id, port.id), structuredClone(value));
  }
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
  readonly #logListeners = new Set<FlowRunLogListener>();
  #run: FlowRunDto | null = null;
  #abortController: AbortController | null = null;
  #execution: Promise<void> | null = null;
  #nextLogId = 1;
  #breakpoints = new Set<string>();
  #stepOnce = false;
  #resumeResolver: ((action: ResumeFlowRunInput["action"]) => void) | null = null;
  #pendingResume: Promise<ResumeFlowRunInput["action"]> | null = null;

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

  subscribeLogs(listener: FlowRunLogListener): () => void {
    this.#logListeners.add(listener);
    return () => this.#logListeners.delete(listener);
  }

  getRun(): FlowRunDto | null {
    return this.#run === null ? null : cloneRun(this.#run);
  }

  start(input: StartFlowRunInput): StartFlowRunResult {
    if (
      this.#run?.state === "running" ||
      this.#run?.state === "paused"
    ) {
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
    this.#breakpoints = new Set(input.breakpoints ?? []);
    this.#stepOnce = false;
    this.#resumeResolver = null;
    this.#pendingResume = null;
    this.#publish();
    this.#emitLog(null, "info", "Flow run started", {
      scriptId: input.scriptId,
      deviceId: input.deviceId,
      displayId: input.displayId,
      breakpoints: [...this.#breakpoints],
      nodeCount: steps.length,
    });
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
    if (run.state === "running" || run.state === "paused") {
      this.#abortController?.abort();
      await this.#execution;
    }
    return { status: "ok", run: cloneRun(this.#run as FlowRunDto) };
  }

  resume(input: ResumeFlowRunInput): ResumeFlowRunResult {
    const run = this.#run;
    if (run === null || run.runId !== input.runId) {
      return { status: "error", error: "run-not-found" };
    }
    if (run.state !== "paused" || this.#resumeResolver === null) {
      return { status: "error", error: "run-not-paused" };
    }
    this.#resumeResolver(input.action);
    return { status: "ok", run: cloneRun(run) };
  }

  async cancelCurrent(): Promise<void> {
    const run = this.#run;
    if (run?.state !== "running" && run?.state !== "paused") {
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
    const incomingData = new Map<string, FlowEdge[]>();
    for (const edge of document.edges) {
      const source = nodes.get(edge.source);
      const target = nodes.get(edge.target);
      if (source === undefined || target === undefined) {
        continue;
      }
      const sourcePort = resolveFlowPort(
        source.type,
        "output",
        edge.sourceHandle,
        source.data,
      );
      const targetPort = resolveFlowPort(
        target.type,
        "input",
        edge.targetHandle,
        target.data,
      );
      if (sourcePort?.role === "flow" && targetPort?.role === "flow") {
        const list = outgoing.get(edge.source);
        if (list) list.push(edge);
        else outgoing.set(edge.source, [edge]);
      } else if (
        sourcePort?.role === "data" &&
        targetPort?.role === "data"
      ) {
        const list = incomingData.get(edge.target);
        if (list) list.push(edge);
        else incomingData.set(edge.target, [edge]);
      }
    }
    const dataValues = new Map<string, JsonValue>();
    const forLoops = new Map<string, ForLoopState>();
    const whileIterations = new Map<string, number>();
    let currentNodeId: string | null = startNodeId;
    let arrivalPort: string | null = null;
    let transitions = 0;

    try {
      for (const node of document.nodes) {
        if (node.type === "screen-region") {
          dataValues.set(
            dataValueKey(node.id, "region"),
            screenRegionValue(node),
          );
        }
      }
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
        await this.#pauseIfNeeded(node.id, signal);
        step.state = "running";
        step.startedAt = this.#now();
        step.finishedAt = null;
        step.error = null;
        step.executionCount += 1;
        run.currentNodeId = node.id;
        this.#publish();
        const enteredAt = Date.now();
        this.#emitLog(node.id, "debug", `Entering ${node.type} node`, {
          executionCount: step.executionCount,
        });

        const resolved = resolveNodeInputs(
          node,
          incomingData.get(node.id) ?? [],
          nodes,
          dataValues,
        );
        const result = await this.#executeNode(
          resolved.node,
          resolved.connected,
          arrivalPort,
          context,
          signal,
          run.variables,
          forLoops,
          whileIterations,
        );
        storeNodeOutputs(node, result.outputs, dataValues);
        abortIfNeeded(signal);
        step.state = "completed";
        step.finishedAt = this.#now();
        run.currentNodeId = null;
        this.#emitLog(node.id, "debug", `Completed ${node.type} node`, {
          durationMs: Date.now() - enteredAt,
          flowPort: result.flowPort,
          outputs: result.outputs,
        });
        this.#publish();

        if (result.flowPort === null) {
          currentNodeId = null;
          continue;
        }
        const declaredOutputs: readonly string[] =
          FLOW_NODE_PORTS[node.type].outputs;
        const edge = (outgoing.get(node.id) ?? []).find(
          (candidate) =>
            resolvedPort(declaredOutputs, candidate.sourceHandle) ===
            result.flowPort,
        );
        if (edge === undefined) {
          throw new Error(
            `Node "${node.id}" has no edge for output port "${result.flowPort}".`,
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
      this.#emitLog(null, "info", "Flow run completed", {
        variables: run.variables,
      });
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
      this.#emitLog(
        currentStep?.nodeId ?? null,
        cancelled ? "warn" : "error",
        cancelled ? "Flow run cancelled" : errorMessageOf(error),
      );
      this.#publish();
    }
  }

  async #pauseIfNeeded(nodeId: string, signal: AbortSignal): Promise<void> {
    if (!this.#breakpoints.has(nodeId) && !this.#stepOnce) {
      return;
    }
    const run = this.#run as FlowRunDto;
    run.state = "paused";
    run.currentNodeId = nodeId;
    this.#emitLog(nodeId, "info", "Paused before executing node");
    this.#publish();
    this.#pendingResume = new Promise<ResumeFlowRunInput["action"]>(
      (resolve, reject) => {
        const onAbort = () => {
          reject(new RunCancelledError());
        };
        signal.addEventListener("abort", onAbort, { once: true });
        this.#resumeResolver = (action) => {
          signal.removeEventListener("abort", onAbort);
          resolve(action);
        };
      },
    );
    try {
      const action = await this.#pendingResume;
      this.#stepOnce = action === "step";
      this.#emitLog(nodeId, "debug", `Resumed (${action})`);
    } finally {
      this.#resumeResolver = null;
      this.#pendingResume = null;
    }
  }

  async #executeNode(
    node: FlowNode,
    connectedInputs: ReadonlySet<string>,
    arrivalPort: string | null,
    context: FlowActionContext,
    signal: AbortSignal,
    variables: Record<string, JsonValue>,
    forLoops: Map<string, ForLoopState>,
    whileIterations: Map<string, number>,
  ): Promise<NodeExecutionResult> {
    switch (node.type) {
      case "start":
        return executionResult("next");
      case "end":
        return executionResult(null);
      case "delay":
        await abortableDelay(
          nonnegativeDuration(node.data.ms, node.id),
          signal,
        );
        return executionResult("next");
      case "ocr": {
        if (this.#recognition === null) {
          throw new Error(`OCR node "${node.id}" has no recognition driver.`);
        }
        const recognitionNode = connectedInputs.has("region")
          ? withExpandedRegion(node)
          : node;
        const recognition = await this.#recognition.recognize(
          recognitionNode,
          context,
          signal,
        );
        this.#emitLog(node.id, "info", "OCR recognized text", {
          text: recognition.outputs.text,
          confidence: recognition.outputs.confidence,
          matched: recognition.outputs.matched,
        });
        for (const [name, value] of Object.entries(
          recognition.assignments,
        )) {
          if (!isSafeVariableName(name)) {
            throw new Error(
              `OCR node "${node.id}" returned invalid variable name "${name}".`,
            );
          }
          variables[name] = value;
        }
        return executionResult("next", recognition.outputs);
      }
      case "click":
      case "swipe":
      case "launch-app":
        await this.#driver.execute(node, context, signal);
        return executionResult("next");
      case "set-variable": {
        const name = variableName(node);
        const value = connectedInputs.has("expression")
          ? node.data.expression
          : evaluateExpression(requiredString(node, "expression"), variables);
        variables[name] = value;
        this.#emitLog(node.id, "info", `Set ${name} = ${formatLogValue(value)}`, {
          name,
          value,
        });
        return executionResult("next", { value });
      }
      case "calculate": {
        const name = variableName(node, "variable");
        const operation = calculateOperation(node);
        const values = calculateValues(node, connectedInputs);
        if (operation === "expression") {
          const expression = requiredString(node, "expression", { trim: true });
          const scope: Record<string, JsonValue> = { ...variables };
          for (const [id, value] of calculateInputEntries(node, connectedInputs)) {
            scope[id] = value;
          }
          const result = evaluateExpression(expression, scope);
          if (typeof result !== "number" || !Number.isFinite(result)) {
            throw new Error(
              `Calculate node "${node.id}" expression must return a finite number.`,
            );
          }
          variables[name] = result;
          this.#emitLog(node.id, "info", `Calculated ${name} = ${formatLogValue(result)}`, {
            operation,
            expression,
            value: result,
          });
          return executionResult("next", { value: result });
        }
        if (operation !== "count" && values.length === 0) {
          throw new Error(
            `Calculate node "${node.id}" requires at least one connected input value.`,
          );
        }
        const result = aggregateValues(operation, values);
        variables[name] = result;
        this.#emitLog(node.id, "info", `Calculated ${name} = ${formatLogValue(result)}`, {
          operation,
          value: result,
          count: values.length,
        });
        return executionResult("next", { value: result });
      }
      case "convert": {
        const result = convertNodeValue(node);
        this.#emitLog(node.id, "info", `Converted value to ${node.data.toType}`, {
          toType: node.data.toType,
          value: result,
        });
        return executionResult("next", { value: result });
      }
      case "compare": {
        const operator = requiredString(node, "operator", { trim: true });
        const left = getFieldOrInputValue(node, "left", connectedInputs, variables);
        const right = getFieldOrInputValue(node, "right", connectedInputs, variables);
        const result = compareWithOperator(operator, left, right, node.id);
        this.#emitLog(node.id, "info", `Compared ${formatLogValue(left)} ${operator} ${formatLogValue(right)} => ${result}`, {
          operator,
          left,
          right,
          result,
        });
        return executionResult("next", { result });
      }
      case "if": {
        let passed: boolean;
        if (isCompareMode(node)) {
          const operator = requiredString(node, "operator", { trim: true });
          const left = getFieldOrInputValue(node, "left", connectedInputs, variables);
          const right = getFieldOrInputValue(node, "right", connectedInputs, variables);
          passed = compareWithOperator(operator, left, right, node.id);
          this.#emitLog(node.id, "info", `Condition compared ${formatLogValue(left)} ${operator} ${formatLogValue(right)} => ${passed}`, {
            operator,
            left,
            right,
            result: passed,
          });
        } else {
          const condition = connectedInputs.has("condition")
            ? node.data.condition
            : evaluateExpression(requiredString(node, "condition"), variables);
          passed = expressionTruthy(condition);
          this.#emitLog(node.id, "info", `Condition evaluated to ${passed ? "true" : "false"}`, {
            result: formatLogValue(condition),
            branch: passed ? "true" : "false",
          });
        }
        const branch = passed ? "true" : "false";
        return executionResult(branch);
      }
      case "merge":
        return executionResult("next");
      case "assert": {
        let passed: boolean;
        let rawCondition: JsonValue;
        if (isCompareMode(node)) {
          const operator = requiredString(node, "operator", { trim: true });
          const left = getFieldOrInputValue(node, "left", connectedInputs, variables);
          const right = getFieldOrInputValue(node, "right", connectedInputs, variables);
          passed = compareWithOperator(operator, left, right, node.id);
          rawCondition = passed;
          this.#emitLog(node.id, "info", `Assertion compared ${formatLogValue(left)} ${operator} ${formatLogValue(right)} => ${passed}`, {
            operator,
            left,
            right,
            result: passed,
          });
        } else {
          const condition = connectedInputs.has("condition")
            ? node.data.condition
            : evaluateExpression(requiredString(node, "condition"), variables);
          rawCondition = condition;
          passed = expressionTruthy(condition);
          this.#emitLog(node.id, "info", passed ? "Assertion passed" : "Assertion failed", {
            result: formatLogValue(condition),
          });
        }
        if (!passed) {
          const message = node.data.message;
          throw new Error(
            typeof message === "string" && message.trim().length > 0
              ? message.trim()
              : `Assertion node "${node.id}" failed.`,
          );
        }
        this.#emitLog(node.id, "info", "Assertion passed", {
          result: formatLogValue(rawCondition),
        });
        return executionResult("next");
      }
      case "for": {
        let loop = forLoops.get(node.id);
        if (arrivalPort === "in") {
          const step = connectedInputs.has("step")
            ? finiteNumberInput(node, "step")
            : numericExpression(node, "step", variables);
          if (step === 0) {
            throw new Error(`For node "${node.id}" step cannot be zero.`);
          }
          loop = {
            variable: variableName(node, "variable"),
            current: connectedInputs.has("from")
              ? finiteNumberInput(node, "from")
              : numericExpression(node, "from", variables),
            to: connectedInputs.has("to")
              ? finiteNumberInput(node, "to")
              : numericExpression(node, "to", variables),
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
          return executionResult("done", { index: loop.current });
        }
        if (loop.iterations >= loop.maximum) {
          throw new Error(
            `For node "${node.id}" exceeded ${loop.maximum} iterations.`,
          );
        }
        loop.iterations += 1;
        variables[loop.variable] = loop.current;
        return executionResult("body", { index: loop.current });
      }
      case "while": {
        if (arrivalPort !== "in" && arrivalPort !== "loop") {
          throw new Error(
            `While node "${node.id}" was entered through invalid port "${arrivalPort ?? "(none)"}".`,
          );
        }
        let continues: boolean;
        if (isCompareMode(node)) {
          const operator = requiredString(node, "operator", { trim: true });
          const left = getFieldOrInputValue(node, "left", connectedInputs, variables);
          const right = getFieldOrInputValue(node, "right", connectedInputs, variables);
          continues = compareWithOperator(operator, left, right, node.id);
          this.#emitLog(node.id, "info", `While compared ${formatLogValue(left)} ${operator} ${formatLogValue(right)} => ${continues}`, {
            operator,
            left,
            right,
            continues,
          });
        } else {
          const condition = connectedInputs.has("condition")
            ? node.data.condition
            : evaluateExpression(requiredString(node, "condition"), variables);
          continues = expressionTruthy(condition);
          this.#emitLog(node.id, "info", `While condition evaluated to ${continues}`, {
            result: formatLogValue(condition),
          });
        }
        if (!continues) {
          whileIterations.delete(node.id);
          return executionResult("done");
        }
        const iterations = whileIterations.get(node.id) ?? 0;
        const maximum = maximumIterations(node);
        if (iterations >= maximum) {
          throw new Error(
            `While node "${node.id}" exceeded ${maximum} iterations.`,
          );
        }
        whileIterations.set(node.id, iterations + 1);
        return executionResult("body");
      }
      case "screen-region":
        throw new Error(
          `Screen region node "${node.id}" has no control flow to execute.`,
        );
    }
  }

  #emitLog(
    nodeId: string | null,
    level: FlowRunLogLevel,
    message: string,
    data: JsonValue | null = null,
  ): void {
    const run = this.#run;
    const entry: FlowRunLogEntryDto = {
      id: this.#nextLogId++,
      runId: run?.runId ?? "",
      nodeId,
      level,
      message,
      data,
      createdAt: this.#now(),
    };
    for (const listener of this.#logListeners) {
      try {
        listener(entry);
      } catch {
        // A broken observer must never stop a background run.
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
