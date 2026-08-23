import { compileFlow } from "../../shared/flow-graph";
import {
  aggregateValues,
  castValue,
  evaluateExpression,
  type AggregateOperation,
  type CastTarget,
} from "../../shared/expression";
import { deriveFlowSignature, bestEffortFlowSignature } from "../../shared/flow-signature";
import {
  FLOW_NODE_PORTS,
  ScreenRegionSchema,
  callTargetIdFromData,
  flowDataInputPorts,
  flowDataOutputPorts,
  flowInputPortIds,
  flowInputNodeParams,
  flowOutputNodeResults,
  matchesFlowDataType as matchesDataType,
  resolveFlowPort,
  type FlowDocument,
  type FlowEdge,
  type FlowNode,
  type FlowPortContext,
  type FlowScriptSignature,
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
  FlowRunMode,
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

function constantValue(node: FlowNode): JsonValue {
  const type = node.data.type;
  if (type === "boolean") {
    return node.data.booleanValue === true;
  }
  if (type === "string") {
    return typeof node.data.stringValue === "string" ? node.data.stringValue : "";
  }
  const value = node.data.numberValue;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
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

function resolveNodeInputs(
  node: FlowNode,
  incomingEdges: readonly FlowEdge[],
  nodes: ReadonlyMap<string, FlowNode>,
  computeOutput: (source: FlowNode, portId: string) => JsonValue,
  portContext: FlowPortContext,
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
      portContext,
    );
    const targetPort = resolveFlowPort(
      node.type,
      "input",
      edge.targetHandle,
      node.data,
      portContext,
    );
    if (sourcePort?.role !== "data" || targetPort?.role !== "data") {
      throw new Error(`Data edge "${edge.id}" has invalid typed ports.`);
    }
    const value = computeOutput(source, sourcePort.id);
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
  portContext: FlowPortContext,
): void {
  const declared = flowDataOutputPorts(node.type, node.data, portContext);
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
  current: number;
  to: number;
  step: number;
  iterations: number;
  maximum: number;
}

/**
 * Collects the declared results of an Output node from its wired data
 * inputs. Every declared result must have exactly one connected value.
 */
function collectOutputResults(
  node: FlowNode,
  connected: ReadonlySet<string>,
): Record<string, JsonValue> {
  const results: Record<string, JsonValue> = {};
  for (const entry of flowOutputNodeResults(node.data)) {
    if (!connected.has(entry.name)) {
      throw new Error(
        `Output node "${node.id}" has no connected value for result "${entry.name}".`,
      );
    }
    const value = node.data[entry.name] as JsonValue;
    if (!matchesDataType(value, entry.dataType)) {
      throw new Error(
        `Output node "${node.id}" result "${entry.name}" must be ${entry.dataType}.`,
      );
    }
    results[entry.name] = structuredClone(value);
  }
  return results;
}

/** Hard cap for nested script calls; cycles are already rejected statically. */
const MAX_CALL_DEPTH = 8;

/** Maximum node transitions across the whole run, shared by all frames. */
const MAX_TRANSITIONS = 100_000;

interface CallableScript {
  document: FlowDocument;
  orderedNodes: FlowNode[];
  signature: FlowScriptSignature;
  /** Maps a declared parameter name to the id of its input node. */
  paramNodeIds: Map<string, string>;
}

interface FrameInvocation {
  document: FlowDocument;
  startNodeId: string;
  initialArrivalPort?: string | null;
  stopAfterNodeId?: string | null;
  allowTerminalWithoutEdge?: boolean;
  argValues: ReadonlyMap<string, JsonValue>;
  depth: number;
  signal: AbortSignal;
  context: FlowActionContext;
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
  #transitions = 0;
  readonly #callCache = new Map<string, CallableScript>();
  readonly #signatureCache = new Map<string, FlowScriptSignature | null>();

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

    const document = input.document ?? script.draftDocument;
    const mode: FlowRunMode = input.mode ?? "flow";
    const entryNodeId = input.entryNodeId ?? null;
    const nodeById = new Map(
      document.nodes.map((node) => [node.id, node]),
    );
    const entryNode = entryNodeId === null ? null : nodeById.get(entryNodeId);
    if (mode !== "flow") {
      if (entryNode === undefined || entryNode === null) {
        return {
          status: "error",
          error: "invalid-flow",
          issues: [
            {
              kind: "missing-endpoint",
              nodeId: entryNodeId ?? undefined,
              message: "A debug run requires an existing entry node.",
            },
          ],
        };
      }
      if (
        entryNode.type === "start" ||
        entryNode.type === "end" ||
        flowInputPortIds(entryNode.type, entryNode.data).length === 0
      ) {
        return {
          status: "error",
          error: "invalid-flow",
          issues: [
            {
              kind: "incompatible-port-role",
              nodeId: entryNode.id,
              message: `Node "${entryNode.id}" cannot be used as a debug entry point.`,
            },
          ],
        };
      }
    }
    let orderedNodes: FlowNode[];
    if (mode === "flow") {
      const compiled = compileFlow(
        document.nodes,
        document.edges,
        { resolveDocument: (scriptId) => this.#loadDocument(scriptId) },
      );
      if (!compiled.valid) {
        return {
          status: "error",
          error: "invalid-flow",
          issues: compiled.issues,
        };
      }
      orderedNodes = compiled.order.map((nodeId) => {
        const node = nodeById.get(nodeId);
        if (node === undefined) {
          throw new Error(`Compiled flow references missing node "${nodeId}".`);
        }
        return node;
      });
    } else {
      // Debug runs intentionally do not require a complete Start -> End graph.
      orderedNodes = [...document.nodes];
    }
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
      mode,
      entryNodeId,
      state: "running",
      currentNodeId: null,
      startedAt,
      finishedAt: null,
      error: null,
      steps,
      result: null,
    };
    const controller = new AbortController();
    this.#abortController = controller;
    this.#breakpoints = new Set(input.breakpoints ?? []);
    this.#stepOnce = false;
    this.#resumeResolver = null;
    this.#pendingResume = null;
    this.#transitions = 0;
    this.#callCache.clear();
    this.#signatureCache.clear();
    const executionStartNodeId =
      mode === "flow" ? orderedNodes[0]?.id ?? "" : entryNode?.id ?? "";
    this.#publish();
    this.#emitLog(null, "info", "Flow run started", {
      scriptId: input.scriptId,
      deviceId: input.deviceId,
      displayId: input.displayId,
      mode,
      entryNodeId,
      breakpoints: [...this.#breakpoints],
      nodeCount: steps.length,
    });
    this.#execution = this.#execute(
      document,
      executionStartNodeId,
      mode === "flow" ? null : "in",
      mode === "single-node" ? entryNodeId : null,
      mode !== "flow",
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
    initialArrivalPort: string | null,
    stopAfterNodeId: string | null,
    allowTerminalWithoutEdge: boolean,
    signal: AbortSignal,
  ): Promise<void> {
    const run = this.#run as FlowRunDto;
    const context: FlowActionContext = {
      runId: run.runId,
      deviceId: run.deviceId,
      sessionId: run.sessionId,
      displayId: run.displayId,
    };
    try {
      const result = await this.#walkFrame({
        document,
        startNodeId,
        initialArrivalPort,
        stopAfterNodeId,
        allowTerminalWithoutEdge,
        argValues: new Map(),
        depth: 0,
        signal,
        context,
      });
      const finishedAt = this.#now();
      for (const step of run.steps) {
        if (step.state === "pending") {
          step.state = "skipped";
          step.finishedAt = finishedAt;
        }
      }
      run.state = "completed";
      run.finishedAt = finishedAt;
      if (result !== null) {
        run.result = result;
        this.#emitLog(null, "info", "Flow run completed", { result });
      } else {
        this.#emitLog(null, "info", "Flow run completed");
      }
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

  /**
   * Walks one document frame: the root document or one nested script call.
   * Data values, loop states and lazy evaluation are scoped to the frame;
   * the transition budget, abort signal, device context and breakpoints are
   * shared across frames. Resolves to the values collected by the Output
   * node that terminated the frame, or null when an End node ended it.
   */
  async #walkFrame(frame: FrameInvocation): Promise<JsonValue | null> {
    const {
      document,
      startNodeId,
      argValues,
      depth,
      signal,
      context,
      allowTerminalWithoutEdge,
    } = frame;
    const run = this.#run as FlowRunDto;
    const portContext = this.#portContext();

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
        portContext,
      );
      const targetPort = resolveFlowPort(
        target.type,
        "input",
        edge.targetHandle,
        target.data,
        portContext,
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
    const computingData = new Set<string>();
    const forLoops = new Map<string, ForLoopState>();
    const whileIterations = new Map<string, number>();
    const repeatUntilIterations = new Map<string, number>();

    // Seed Input boundary values for this frame: caller arguments win over
    // declared defaults. Root frames tolerate missing arguments (they fail
    // lazily on read) so scripts remain runnable standalone.
    for (const boundaryNode of document.nodes) {
      if (boundaryNode.type !== "input") {
        continue;
      }
      for (const param of flowInputNodeParams(boundaryNode.data)) {
        const key = dataValueKey(boundaryNode.id, param.name);
        const provided = argValues.get(key);
        if (provided !== undefined) {
          dataValues.set(key, structuredClone(provided));
          continue;
        }
        if (param.defaultValue !== undefined) {
          dataValues.set(key, structuredClone(param.defaultValue));
          continue;
        }
        if (depth > 0) {
          throw new Error(
            `Called script did not receive an argument for input "${param.name}".`,
          );
        }
      }
    }

    // Collects the values captured by Output nodes; the terminating End node
    // returns whatever was captured last (or null for plain flows).
    let frameResult: JsonValue | null = null;

    let currentNodeId: string | null = startNodeId;
    let arrivalPort: string | null = frame.initialArrivalPort ?? null;

    const computePureDataNode = (node: FlowNode): void => {
      if (computingData.has(node.id)) {
        throw new Error(
          `Data dependency cycle detected while evaluating "${node.id}".`,
        );
      }
      computingData.add(node.id);
      try {
        switch (node.type) {
          case "constant": {
            dataValues.set(
              dataValueKey(node.id, "value"),
              structuredClone(constantValue(node)),
            );
            break;
          }
          case "screen-region": {
            dataValues.set(
              dataValueKey(node.id, "region"),
              structuredClone(screenRegionValue(node)),
            );
            break;
          }
          case "compare": {
const resolved = resolveNodeInputs(
        node,
        incomingData.get(node.id) ?? [],
        nodes,
        computeDataOutput,
        portContext,
      );
            if (!resolved.connected.has("left")) {
              throw new Error(
                `Compare node "${node.id}" requires a connected "left" input.`,
              );
            }
            if (!resolved.connected.has("right")) {
              throw new Error(
                `Compare node "${node.id}" requires a connected "right" input.`,
              );
            }
            const operator = requiredString(resolved.node, "operator", {
              trim: true,
            });
            const left = resolved.node.data.left as JsonValue;
            const right = resolved.node.data.right as JsonValue;
            const result = compareWithOperator(operator, left, right, node.id);
            this.#emitLog(
              node.id,
              "info",
              `Compared ${formatLogValue(left)} ${operator} ${formatLogValue(right)} => ${result}`,
              { operator, left, right, result },
            );
            dataValues.set(
              dataValueKey(node.id, "result"),
              structuredClone(result),
            );
            break;
          }
          default:
            throw new Error(
              `Node "${node.id}" cannot be evaluated as a data node.`,
            );
        }
      } finally {
        computingData.delete(node.id);
      }
    };

    const computeDataOutput = (source: FlowNode, portId: string): JsonValue => {
      const key = dataValueKey(source.id, portId);
      // Compare nodes depend on outputs from executable nodes such as OCR.
      // Re-evaluate them on every read so a repeat-until loop observes the
      // latest body result instead of the first comparison being cached.
      if (source.type === "compare") {
        computePureDataNode(source);
        if (!dataValues.has(key)) {
          throw new Error(
            `Node "${source.id}" did not produce output "${portId}".`,
          );
        }
        return dataValues.get(key) as JsonValue;
      }
      if (dataValues.has(key)) {
        return dataValues.get(key) as JsonValue;
      }
      if (
        source.type === "constant" ||
        source.type === "screen-region"
      ) {
        computePureDataNode(source);
        if (!dataValues.has(key)) {
          throw new Error(
            `Node "${source.id}" did not produce output "${portId}".`,
          );
        }
        return dataValues.get(key) as JsonValue;
      }
      throw new Error(
        `Data input was read before output "${source.id}.${portId}" was produced.`,
      );
    };

    while (currentNodeId !== null) {
      this.#transitions += 1;
      if (this.#transitions > MAX_TRANSITIONS) {
        throw new Error(
          `Flow exceeded the maximum of ${MAX_TRANSITIONS} node transitions.`,
        );
      }
      abortIfNeeded(signal);
      const node = nodes.get(currentNodeId);
      const step = steps.get(currentNodeId) ?? null;
      if (node === undefined) {
        throw new Error(`Flow reached missing node "${currentNodeId}".`);
      }
      await this.#pauseIfNeeded(node.id, signal);
      if (step !== null) {
        step.state = "running";
        step.startedAt = this.#now();
        step.finishedAt = null;
        step.error = null;
        step.executionCount += 1;
      }
      run.currentNodeId = node.id;
      this.#publish();
      const enteredAt = Date.now();
      this.#emitLog(node.id, "debug", `Entering ${node.type} node`, {
        executionCount: step?.executionCount ?? 0,
      });

      const resolved = resolveNodeInputs(
        node,
        node.type === "repeat-until" && arrivalPort === "in"
          ? []
          : (incomingData.get(node.id) ?? []),
        nodes,
        computeDataOutput,
        portContext,
      );

      let result: NodeExecutionResult;
      if (node.type === "output") {
        const results = collectOutputResults(resolved.node, resolved.connected);
        frameResult = results;
        this.#emitLog(node.id, "info", "Captured results", {
          durationMs: Date.now() - enteredAt,
          results,
        });
        result = executionResult("next");
      } else {
        result = await this.#executeNode(
          resolved.node,
          resolved.connected,
          arrivalPort,
          context,
          signal,
          forLoops,
          whileIterations,
          repeatUntilIterations,
          depth,
        );
      }
      storeNodeOutputs(node, result.outputs, dataValues, portContext);
      abortIfNeeded(signal);
      if (step !== null) {
        step.state = "completed";
        step.finishedAt = this.#now();
      }
      run.currentNodeId = null;
      this.#emitLog(node.id, "debug", `Completed ${node.type} node`, {
        durationMs: Date.now() - enteredAt,
        flowPort: result.flowPort,
        outputs: result.outputs,
      });
      this.#publish();

      if (frame.stopAfterNodeId === node.id) {
        currentNodeId = null;
        continue;
      }

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
        if (allowTerminalWithoutEdge) {
          currentNodeId = null;
          continue;
        }
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
    return frameResult;
  }

  #loadDocument(scriptId: string): FlowDocument | null {
    return this.#repository.getScript({ scriptId })?.draftDocument ?? null;
  }

  /** Cached per run so one execution observes a single persisted snapshot. */
  #signatureOf(scriptId: string): FlowScriptSignature | null {
    if (!this.#signatureCache.has(scriptId)) {
      const document = this.#loadDocument(scriptId);
      this.#signatureCache.set(
        scriptId,
        document === null ? null : bestEffortFlowSignature(document),
      );
    }
    return this.#signatureCache.get(scriptId) ?? null;
  }

  #portContext(): FlowPortContext {
    return { resolveCallSignature: (scriptId) => this.#signatureOf(scriptId) };
  }

  /** Loads, validates and caches a callable target on first use per run. */
  #callable(scriptId: string): CallableScript {
    const cached = this.#callCache.get(scriptId);
    if (cached !== undefined) {
      return cached;
    }
    const document = this.#loadDocument(scriptId);
    if (document === null) {
      throw new Error(`Call target script "${scriptId}" was not found.`);
    }
    const derived = deriveFlowSignature(document);
    if (!derived.ok) {
      throw new Error(
        `Call target script "${scriptId}" has no usable signature.`,
      );
    }
    const compiled = compileFlow(document.nodes, document.edges, {
      resolveDocument: (id) => this.#loadDocument(id),
    });
    if (!compiled.valid) {
      const kinds = [...new Set(compiled.issues.map((i) => i.kind))].join(", ");
      throw new Error(
        `Call target script "${scriptId}" is invalid (${kinds}).`,
      );
    }
    const nodeById = new Map(document.nodes.map((node) => [node.id, node]));
    const orderedNodes = compiled.order.map((nodeId) => {
      const node = nodeById.get(nodeId);
      if (node === undefined) {
        throw new Error(`Compiled flow references missing node "${nodeId}".`);
      }
      return node;
    });
    const paramNodeIds = new Map<string, string>();
    for (const node of document.nodes) {
      if (node.type !== "input") {
        continue;
      }
      for (const param of flowInputNodeParams(node.data)) {
        if (param.name.length > 0 && !paramNodeIds.has(param.name)) {
          paramNodeIds.set(param.name, node.id);
        }
      }
    }
    const entry: CallableScript = {
      document,
      orderedNodes,
      signature: derived.signature,
      paramNodeIds,
    };
    this.#callCache.set(scriptId, entry);
    return entry;
  }

  async #executeCallNode(
    node: FlowNode,
    connectedInputs: ReadonlySet<string>,
    depth: number,
    signal: AbortSignal,
    context: FlowActionContext,
  ): Promise<NodeExecutionResult> {
    if (depth >= MAX_CALL_DEPTH) {
      throw new Error(
        `Exceeded the maximum script call depth of ${MAX_CALL_DEPTH}.`,
      );
    }
    const targetId = callTargetIdFromData(node.data);
    if (targetId.length === 0) {
      throw new Error(`Call node "${node.id}" does not select a target script.`);
    }
    const entry = this.#callable(targetId);
    const argValues = new Map<string, JsonValue>();
    for (const param of entry.signature.params) {
      const paramNodeId = entry.paramNodeIds.get(param.name);
      if (paramNodeId === undefined) {
        throw new Error(
          `Call target "${targetId}" parameter "${param.name}" has no matching Input node.`,
        );
      }
      let value = connectedInputs.has(param.name)
        ? (node.data[param.name] as JsonValue | undefined)
        : undefined;
      if (value === undefined || value === null) {
        value = param.defaultValue;
      }
      if (value === undefined) {
        throw new Error(
          `Call node "${node.id}" is missing argument "${param.name}".`,
        );
      }
      if (!matchesDataType(value, param.dataType)) {
        throw new Error(
          `Argument "${param.name}" on call node "${node.id}" must be ${param.dataType}.`,
        );
      }
      argValues.set(
        dataValueKey(paramNodeId, param.name),
        structuredClone(value),
      );
    }
    const argumentLog: Record<string, JsonValue> = {};
    for (const p of entry.signature.params) {
      argumentLog[p.name] =
        argValues.get(
          dataValueKey(entry.paramNodeIds.get(p.name) ?? "", p.name),
        ) ?? null;
    }
    this.#emitLog(node.id, "info", `Calling script "${targetId}"`, {
      depth: depth + 1,
      arguments: argumentLog,
    });
    const childStartId = entry.orderedNodes[0]?.id ?? "";
    if (childStartId.length === 0) {
      throw new Error(`Call target script "${targetId}" is empty.`);
    }
    const childResult = await this.#walkFrame({
      document: entry.document,
      startNodeId: childStartId,
      argValues,
      depth: depth + 1,
      signal,
      context,
    });
    if (childResult === null) {
      throw new Error(
        `Called script "${targetId}" finished without reaching an Output node.`,
      );
    }
    this.#emitLog(node.id, "info", `Script "${targetId}" returned`, {
      result: childResult,
    });
    // The called script's Output node always returns a results record.
    return executionResult("next", childResult as Record<string, JsonValue>);
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
    forLoops: Map<string, ForLoopState>,
    whileIterations: Map<string, number>,
    repeatUntilIterations: Map<string, number>,
    depth: number,
  ): Promise<NodeExecutionResult> {
    switch (node.type) {
      case "start":
        return executionResult("next");
      case "end":
        return executionResult(null);
      case "call":
        return await this.#executeCallNode(
          node,
          connectedInputs,
          depth,
          signal,
          context,
        );
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
        return executionResult("next", recognition.outputs);
      }
      case "click":
      case "swipe":
        await this.#driver.execute(node, context, signal);
        return executionResult("next");
      case "calculate": {
        const operation = calculateOperation(node);
        const values = calculateValues(node, connectedInputs);
        if (operation === "expression") {
          const expression = requiredString(node, "expression", { trim: true });
          const scope: Record<string, JsonValue> = {};
          for (const [id, value] of calculateInputEntries(node, connectedInputs)) {
            scope[id] = value;
          }
          const result = evaluateExpression(expression, scope);
          if (typeof result !== "number" || !Number.isFinite(result)) {
            throw new Error(
              `Calculate node "${node.id}" expression must return a finite number.`,
            );
          }
          this.#emitLog(node.id, "info", `Calculated = ${formatLogValue(result)}`, {
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
        this.#emitLog(node.id, "info", `Calculated = ${formatLogValue(result)}`, {
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
      case "if": {
        if (!connectedInputs.has("condition")) {
          throw new Error(
            `If node "${node.id}" requires a connected "condition" input.`,
          );
        }
        const passed = node.data.condition === true;
        this.#emitLog(
          node.id,
          "info",
          `Condition is ${passed ? "true" : "false"}`,
          { branch: passed ? "true" : "false" },
        );
        return executionResult(passed ? "true" : "false");
      }
      case "merge":
        return executionResult("next");
      case "assert": {
        if (!connectedInputs.has("condition")) {
          throw new Error(
            `Assert node "${node.id}" requires a connected "condition" input.`,
          );
        }
        const passed = node.data.condition === true;
        if (!passed) {
          const message = node.data.message;
          throw new Error(
            typeof message === "string" && message.trim().length > 0
              ? message.trim()
              : `Assertion node "${node.id}" failed.`,
          );
        }
        this.#emitLog(node.id, "info", "Assertion passed");
        return executionResult("next");
      }
      case "for": {
        let loop = forLoops.get(node.id);
        if (arrivalPort === "in") {
          const step = finiteNumberInput(node, "step");
          if (step === 0) {
            throw new Error(`For node "${node.id}" step cannot be zero.`);
          }
          loop = {
            current: finiteNumberInput(node, "from"),
            to: finiteNumberInput(node, "to"),
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
        return executionResult("body", { index: loop.current });
      }
      case "while": {
        if (arrivalPort !== "in" && arrivalPort !== "loop") {
          throw new Error(
            `While node "${node.id}" was entered through invalid port "${arrivalPort ?? "(none)"}".`,
          );
        }
        if (!connectedInputs.has("condition")) {
          throw new Error(
            `While node "${node.id}" requires a connected "condition" input.`,
          );
        }
        const continues = node.data.condition === true;
        this.#emitLog(
          node.id,
          "info",
          `While condition evaluated to ${continues}`,
          { continues },
        );
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
      case "repeat-until": {
        if (arrivalPort !== "in" && arrivalPort !== "loop") {
          throw new Error(
            `Repeat-until node "${node.id}" was entered through invalid port "${arrivalPort ?? "(none)"}".`,
          );
        }

        if (arrivalPort === "in") {
          // This is deliberately a post-test loop: the body must run once
          // before its condition can be evaluated (for example, OCR -> compare).
          repeatUntilIterations.set(node.id, 1);
          return executionResult("body");
        }

        if (!connectedInputs.has("condition")) {
          throw new Error(
            `Repeat-until node "${node.id}" requires a connected "condition" input.`,
          );
        }
        const done = node.data.condition === true;
        this.#emitLog(
          node.id,
          "info",
          `Repeat-until condition evaluated to ${done}`,
          { done },
        );
        if (done) {
          repeatUntilIterations.delete(node.id);
          return executionResult("done");
        }

        const iterations = repeatUntilIterations.get(node.id) ?? 0;
        const maximum = maximumIterations(node);
        if (iterations >= maximum) {
          throw new Error(
            `Repeat-until node "${node.id}" exceeded ${maximum} iterations.`,
          );
        }
        repeatUntilIterations.set(node.id, iterations + 1);
        return executionResult("body");
      }
      case "screen-region":
        throw new Error(
          `Screen region node "${node.id}" has no control flow to execute.`,
        );
      case "constant":
        throw new Error(
          `Constant node "${node.id}" has no control flow to execute.`,
        );
      case "compare":
        throw new Error(
          `Compare node "${node.id}" has no control flow to execute.`,
        );
      case "input":
        throw new Error(
          `Input node "${node.id}" has no control flow to execute.`,
        );
      case "output":
        // Handled inline by #walkFrame so results can flow on to End.
        throw new Error(
          `Output node "${node.id}" has no control flow to execute.`,
        );
      case "note":
        throw new Error(`Note node "${node.id}" is not executable.`);
      case "group":
        throw new Error(`Group node "${node.id}" is not executable.`);
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
