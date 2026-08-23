import { z } from "zod";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

const JsonObjectSchema = z.record(z.string(), JsonValueSchema);

export const FLOW_NODE_KINDS = [
  "start",
  "end",
  "click",
  "swipe",
  "ocr",
  "delay",
  "calculate",
  "convert",
  "compare",
  "if",
  "merge",
  "for",
  "while",
  "repeat-until",
  "forever",
  "assert",
  "log",
  "screen-region",
  "constant",
  "constant-ref",
  "note",
  "group",
  "input",
  "output",
  "call",
] as const;

export type FlowNodeKind = (typeof FLOW_NODE_KINDS)[number];

export const FLOW_NODE_PORTS = {
  start: { inputs: [], outputs: ["next"] },
  end: { inputs: ["in"], outputs: [] },
  click: { inputs: ["in"], outputs: ["next"] },
  swipe: { inputs: ["in"], outputs: ["next"] },
  ocr: { inputs: ["in"], outputs: ["next"] },
  delay: { inputs: ["in"], outputs: ["next"] },
  calculate: { inputs: ["in"], outputs: ["next"] },
  convert: { inputs: ["in"], outputs: ["next"] },
  compare: { inputs: [], outputs: [] },
  if: { inputs: ["in"], outputs: ["true", "false"] },
  merge: { inputs: [], outputs: ["next"] },
  for: { inputs: ["in", "loop"], outputs: ["body", "done"] },
  while: { inputs: ["in", "loop"], outputs: ["body", "done"] },
  "repeat-until": { inputs: ["in", "loop"], outputs: ["body", "done"] },
  forever: { inputs: ["in", "loop"], outputs: ["body"] },
  assert: { inputs: ["in"], outputs: ["next"] },
  log: { inputs: ["in"], outputs: ["next"] },
  "screen-region": { inputs: [], outputs: [] },
  constant: { inputs: [], outputs: [] },
  "constant-ref": { inputs: [], outputs: [] },
  note: { inputs: [], outputs: [] },
  group: { inputs: [], outputs: [] },
  input: { inputs: [], outputs: [] },
  output: { inputs: ["in"], outputs: ["next"] },
  call: { inputs: ["in"], outputs: ["next"] },
} as const satisfies Record<
  FlowNodeKind,
  { inputs: readonly string[]; outputs: readonly string[] }
>;

export const FLOW_DATA_TYPES = [
  "any",
  "string",
  "number",
  "boolean",
  "screen-region",
] as const;

export type FlowDataType = (typeof FLOW_DATA_TYPES)[number];

export const FLOW_DATA_TYPE_LABELS: Record<FlowDataType, string> = {
  any: "Any",
  string: "String",
  number: "Number",
  boolean: "Boolean",
  "screen-region": "ScreenRegion",
};

export const ScreenRegionSchema = z
  .object({
    x: z.number().finite().nonnegative(),
    y: z.number().finite().nonnegative(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
  })
  .strict();

export type ScreenRegion = z.infer<typeof ScreenRegionSchema>;

export interface FlowDataPortDefinition {
  id: string;
  label: string;
  dataType: FlowDataType;
  field?: string;
}

interface FlowNodeDataPorts {
  inputs: readonly FlowDataPortDefinition[];
  outputs: readonly FlowDataPortDefinition[];
}

const dataPort = (
  id: string,
  label: string,
  dataType: FlowDataType,
  field = id,
): FlowDataPortDefinition => ({ id, label, dataType, field });

const outputPort = (
  id: string,
  label: string,
  dataType: FlowDataType,
): FlowDataPortDefinition => ({ id, label, dataType });

export const FLOW_NODE_DATA_PORTS = {
  start: { inputs: [], outputs: [] },
  end: { inputs: [], outputs: [] },
  click: {
    inputs: [dataPort("x", "X", "number"), dataPort("y", "Y", "number")],
    outputs: [],
  },
  swipe: {
    inputs: [
      dataPort("fromX", "From X", "number"),
      dataPort("fromY", "From Y", "number"),
      dataPort("toX", "To X", "number"),
      dataPort("toY", "To Y", "number"),
      dataPort("durationMs", "Duration", "number"),
    ],
    outputs: [],
  },
  ocr: {
    inputs: [
      dataPort("region", "Region", "screen-region"),
      dataPort("expectedText", "Expected text", "string"),
    ],
    outputs: [
      outputPort("text", "Text", "string"),
      outputPort("confidence", "Confidence", "number"),
      outputPort("matched", "Matched", "boolean"),
    ],
  },
  delay: {
    inputs: [dataPort("ms", "Duration", "number")],
    outputs: [],
  },
  calculate: {
    inputs: [],
    outputs: [outputPort("value", "Value", "number")],
  },
  convert: {
    inputs: [dataPort("value", "Value", "any")],
    outputs: [outputPort("value", "Value", "any")],
  },
  compare: {
    inputs: [
      dataPort("left", "Left", "any"),
      dataPort("right", "Right", "any"),
    ],
    outputs: [outputPort("result", "Result", "boolean")],
  },
  if: {
    inputs: [dataPort("condition", "Condition", "boolean")],
    outputs: [],
  },
  merge: { inputs: [], outputs: [] },
  for: {
    inputs: [
      dataPort("from", "From", "number"),
      dataPort("to", "To", "number"),
      dataPort("step", "Step", "number"),
    ],
    outputs: [outputPort("index", "Index", "number")],
  },
  while: {
    inputs: [dataPort("condition", "Condition", "boolean")],
    outputs: [],
  },
  "repeat-until": {
    inputs: [dataPort("condition", "Condition", "boolean")],
    outputs: [],
  },
  forever: { inputs: [], outputs: [] },
  assert: {
    inputs: [dataPort("condition", "Condition", "boolean")],
    outputs: [],
  },
  log: {
    inputs: [],
    outputs: [],
  },
  "screen-region": {
    inputs: [],
    outputs: [outputPort("region", "Region", "screen-region")],
  },
  constant: {
    inputs: [],
    outputs: [outputPort("value", "Value", "any")],
  },
  "constant-ref": {
    inputs: [],
    outputs: [outputPort("value", "Value", "any")],
  },
  note: { inputs: [], outputs: [] },
  group: { inputs: [], outputs: [] },
  input: { inputs: [], outputs: [] },
  output: { inputs: [], outputs: [] },
  call: { inputs: [], outputs: [] },
} as const satisfies Record<FlowNodeKind, FlowNodeDataPorts>;

export type FlowPortDirection = "input" | "output";

export interface FlowDynamicInputConfig {
  countField: string;
  min: number;
  max: number;
}

/**
 * Data input ports that a node can grow dynamically (ComfyUI-style a, b, c...).
 * Each generated port has an alphabetic id/label and a fixed data type.
 */
export const FLOW_NODE_DYNAMIC_INPUTS: Partial<
  Record<FlowNodeKind, FlowDynamicInputConfig & { dataType: FlowDataType }>
> = {
  calculate: { countField: "inputCount", min: 1, max: 26, dataType: "any" },
  log: { countField: "inputCount", min: 1, max: 26, dataType: "any" },
};

/** Flow (control) input ports that a node can grow dynamically. */
export const FLOW_NODE_DYNAMIC_FLOW_INPUTS: Partial<
  Record<FlowNodeKind, FlowDynamicInputConfig>
> = {
  merge: { countField: "inputCount", min: 2, max: 26 },
};

/** Maps a zero-based index to an Excel-style alphabetic port id: a, b, ..., z, aa, ... */
export function flowDynamicPortId(index: number): string {
  let id = "";
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    id = String.fromCharCode(97 + remainder) + id;
    n = Math.floor((n - 1) / 26);
  }
  return id;
}

type DynamicPortData = Readonly<Record<string, JsonValue>> | undefined;

function dynamicPortCount(
  data: DynamicPortData,
  config: FlowDynamicInputConfig,
): number {
  const raw = data?.[config.countField];
  const value =
    typeof raw === "number" && Number.isInteger(raw) ? raw : config.min;
  return Math.min(config.max, Math.max(config.min, value));
}

export function flowDynamicPortCount(
  kind: FlowNodeKind,
  data: DynamicPortData,
  context?: FlowPortContext,
): number | null {
  data = flowNodeDataForReference(kind, data, context);
  const config =
    FLOW_NODE_DYNAMIC_INPUTS[kind] ?? FLOW_NODE_DYNAMIC_FLOW_INPUTS[kind];
  return config === undefined ? null : dynamicPortCount(data, config);
}

// ---------------------------------------------------------------------------
// Callable scripts (input / output boundary nodes and call nodes)
// ---------------------------------------------------------------------------

/**
 * A single parameter declared by an `input` node. Callers must supply a
 * value unless a default is declared.
 */
export interface FlowScriptParam {
  name: string;
  dataType: FlowDataType;
  defaultValue?: JsonValue;
}

/** A single named value returned through an `output` node. */
export interface FlowScriptResult {
  name: string;
  dataType: FlowDataType;
}

/** The callable surface of a script, derived from its input/output nodes. */
export interface FlowScriptSignature {
  params: FlowScriptParam[];
  results: FlowScriptResult[];
}

export const FLOW_PORT_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Handle names already taken by built-in control-flow ports. Parameter and
 * result names must not shadow them because they become port ids on `call`
 * nodes.
 */
export const RESERVED_FLOW_PORT_NAMES: ReadonlySet<string> = new Set([
  "in",
  "next",
]);

export function isValidFlowPortName(name: string): boolean {
  return (
    FLOW_PORT_NAME_PATTERN.test(name) && !RESERVED_FLOW_PORT_NAMES.has(name)
  );
}

export function isFlowDataType(value: unknown): value is FlowDataType {
  return (
    typeof value === "string" &&
    (FLOW_DATA_TYPES as readonly string[]).includes(value)
  );
}

/** Runtime shape check for a JSON value against a declared flow data type. */
export function matchesFlowDataType(
  value: JsonValue,
  dataType: FlowDataType,
): boolean {
  switch (dataType) {
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

const FALLBACK_PARAM_NAME = "param";
const FALLBACK_RESULT_NAME = "result";

function trimName(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

/**
 * Normalized parameters declared by an `input` node's data. Supports the
 * modern `params` array (one entry per parameter) and the legacy single
 * `paramName`/`dataType`/`defaultValue` shape so older drafts keep working.
 * Malformed values fall back to safe defaults so that port resolution keeps
 * working; strict validation lives in flow-signature / flow-graph.
 */
export function flowInputNodeParams(data: DynamicPortData): FlowScriptParam[] {
  const raw = data?.params;
  if (Array.isArray(raw)) {
    const params: FlowScriptParam[] = [];
    for (const entry of raw) {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        continue;
      }
      const record = entry as Record<string, JsonValue>;
      const param: FlowScriptParam = {
        name: trimName(record.name, FALLBACK_PARAM_NAME),
        dataType: isFlowDataType(record.dataType) ? record.dataType : "any",
      };
      // null is treated as "no default" so editors can clear the field.
      if (record.defaultValue !== undefined && record.defaultValue !== null) {
        param.defaultValue = record.defaultValue;
      }
      params.push(param);
    }
    return params;
  }
  if (data !== undefined && typeof data.paramName === "string") {
    const param: FlowScriptParam = {
      name: trimName(data.paramName, FALLBACK_PARAM_NAME),
      dataType: isFlowDataType(data?.dataType) ? data.dataType : "any",
    };
    if (data.defaultValue !== undefined && data.defaultValue !== null) {
      param.defaultValue = data.defaultValue;
    }
    return [param];
  }
  return [];
}

/**
 * Normalized result declarations of an `output` node's data. An output node
 * without declared entries resolves to no data input ports.
 */
export function flowOutputNodeResults(
  data: DynamicPortData,
): FlowScriptResult[] {
  const raw = data?.results;
  if (!Array.isArray(raw)) {
    return [];
  }
  const results: FlowScriptResult[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Record<string, JsonValue>;
    results.push({
      name: trimName(record.name, FALLBACK_RESULT_NAME),
      dataType: isFlowDataType(record.dataType) ? record.dataType : "any",
    });
  }
  return results;
}

/** The trimmed target script id stored on a `call` node ("" when absent). */
export function callTargetIdFromData(data: DynamicPortData): string {
  const raw = data?.targetScriptId;
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Data ports contributed by a `call` node for the given target signature.
 * Returns empty lists when the target is unknown so that wiring problems are
 * reported once (unknown-call-target) instead of once per edge.
 */
export function flowCallNodeDataPorts(signature: FlowScriptSignature | null): {
  inputs: FlowDataPortDefinition[];
  outputs: FlowDataPortDefinition[];
} {
  if (signature === null) {
    return { inputs: [], outputs: [] };
  }
  const port = (entry: { name: string; dataType: FlowDataType }) => ({
    id: entry.name,
    label: entry.name,
    dataType: entry.dataType,
  });
  return {
    inputs: signature.params.map(port),
    outputs: signature.results.map(port),
  };
}

/**
 * Extra resolution context for node kinds whose ports depend on documents
 * other than their own (`call` nodes).
 */
export interface FlowPortContext {
  /**
   * Resolves the signature of a called script. Returning null marks the
   * target as unknown/unusable and suppresses the call node's data ports.
   */
  resolveCallSignature?: (scriptId: string) => FlowScriptSignature | null;
  /** Resolves the effective value and type of a constant reference node. */
  resolveConstantReference?: (
    sourceNodeId: string,
  ) => FlowConstantReference | null;
  /** Resolves the effective source node behind a generic read-only reference. */
  resolveNodeReference?: (sourceNodeId: string) => FlowNodeReference | null;
}

export interface FlowNodeReference {
  type: FlowNodeKind;
  data: Readonly<Record<string, JsonValue>>;
}

export type FlowConstantType = "number" | "string" | "boolean";

export interface FlowConstantReference {
  type: FlowConstantType;
  value: JsonValue;
}

/** Resolves the effective value of a persisted constant or constant reference. */
export function constantReferenceFromData(
  data: Readonly<Record<string, JsonValue>> | undefined,
): FlowConstantReference | null {
  const type = data?.type;
  if (type === "boolean") {
    return { type, value: data?.booleanValue === true };
  }
  if (type === "string") {
    return {
      type,
      value: typeof data?.stringValue === "string" ? data.stringValue : "",
    };
  }
  // Keep the runtime's legacy behavior: missing or invalid constant types are
  // treated as numeric constants until the user corrects the setting.
  const value = data?.numberValue;
  return {
    type: "number",
    value: typeof value === "number" && Number.isFinite(value) ? value : 0,
  };
}

function derivedCallNodePorts(
  direction: FlowPortDirection,
  data: DynamicPortData,
  context: FlowPortContext | undefined,
): FlowDataPortDefinition[] {
  if (context?.resolveCallSignature === undefined) {
    return [];
  }
  const targetId = callTargetIdFromData(data);
  if (targetId.length === 0) {
    return [];
  }
  const ports = flowCallNodeDataPorts(
    context.resolveCallSignature(targetId) ?? null,
  );
  return direction === "input" ? ports.inputs : ports.outputs;
}

function configuredOutputDataType(
  kind: FlowNodeKind,
  data: DynamicPortData,
  context?: FlowPortContext,
): FlowDataType | null {
  data = flowNodeDataForReference(kind, data, context);
  if (kind === "constant") {
    if (data?.type === "string" || data?.type === "boolean") {
      return data.type;
    }
    // The runtime treats missing/invalid constant types as numbers.
    return "number";
  }
  if (kind === "constant-ref") {
    const sourceNodeId = data?.sourceNodeId;
    if (typeof sourceNodeId === "string") {
      return context?.resolveConstantReference?.(sourceNodeId)?.type ?? "any";
    }
    return "any";
  }
  if (kind === "convert") {
    if (data?.toType === "string" || data?.toType === "boolean") {
      return data.toType;
    }
    if (data?.toType === "number" || data?.toType === "int") {
      return "number";
    }
    // Invalid conversion settings are rejected by the runtime; keep the
    // editor permissive until the setting is corrected.
    return "any";
  }
  return null;
}

/** All flow input port ids for a node, including any dynamic flow inputs. */
export function flowInputPortIds(
  kind: FlowNodeKind,
  data: DynamicPortData,
  context?: FlowPortContext,
): string[] {
  data = flowNodeDataForReference(kind, data, context);
  const ids: string[] = [...FLOW_NODE_PORTS[kind].inputs];
  const config = FLOW_NODE_DYNAMIC_FLOW_INPUTS[kind];
  if (config !== undefined) {
    const count = dynamicPortCount(data, config);
    for (let index = 0; index < count; index += 1) {
      ids.push(flowDynamicPortId(index));
    }
  }
  return ids;
}

/** All data input ports for a node, including dynamic and derived ones. */
export function flowDataInputPorts(
  kind: FlowNodeKind,
  data: DynamicPortData,
  context?: FlowPortContext,
): FlowDataPortDefinition[] {
  data = flowNodeDataForReference(kind, data, context);
  const inputs = [...FLOW_NODE_DATA_PORTS[kind].inputs];
  const config = FLOW_NODE_DYNAMIC_INPUTS[kind];
  if (config !== undefined) {
    const count = dynamicPortCount(data, config);
    for (let index = 0; index < count; index += 1) {
      const id = flowDynamicPortId(index);
      inputs.push({ id, label: id, dataType: config.dataType });
    }
  }
  if (kind === "output") {
    for (const result of flowOutputNodeResults(data)) {
      inputs.push({
        id: result.name,
        label: result.name,
        dataType: result.dataType,
      });
    }
  } else if (kind === "call") {
    inputs.push(...derivedCallNodePorts("input", data, context));
  } else if (
    kind === "log" &&
    data?.inputCount === undefined &&
    data !== undefined &&
    Object.hasOwn(data, "message")
  ) {
    // Legacy Log nodes used one fixed `message` data input before dynamic
    // value ports were introduced.
    inputs.push(dataPort("message", "Value", "any"));
  }
  return inputs;
}

/** All data output ports for a node, including per-node derived ones. */
export function flowDataOutputPorts(
  kind: FlowNodeKind,
  data: DynamicPortData,
  context?: FlowPortContext,
): FlowDataPortDefinition[] {
  data = flowNodeDataForReference(kind, data, context);
  const configuredType = configuredOutputDataType(kind, data, context);
  const outputs = FLOW_NODE_DATA_PORTS[kind].outputs.map((port) =>
    configuredType !== null && port.id === "value"
      ? { ...port, dataType: configuredType }
      : port,
  );
  if (kind === "input") {
    const seen = new Set<string>();
    for (const param of flowInputNodeParams(data)) {
      // Param names are validated unique per script; dedupe defensively so
      // duplicate declarations cannot produce colliding handle ids.
      if (seen.has(param.name)) {
        continue;
      }
      seen.add(param.name);
      outputs.push({
        id: param.name,
        label: param.name,
        dataType: param.dataType,
      });
    }
  } else if (kind === "call") {
    outputs.push(...derivedCallNodePorts("output", data, context));
  }
  return outputs;
}

export type ResolvedFlowPort =
  | { id: string; role: "flow"; dataType: "flow" }
  | ({ role: "data" } & FlowDataPortDefinition);

export function resolveFlowPort(
  kind: FlowNodeKind,
  direction: FlowPortDirection,
  persistedPort: string | undefined,
  data?: DynamicPortData,
  context?: FlowPortContext,
): ResolvedFlowPort | null {
  if (direction === "input") {
    const flowPorts = flowInputPortIds(kind, data, context);
    const resolvedId =
      persistedPort ?? (flowPorts.length === 1 ? flowPorts[0] : undefined);
    if (
      resolvedId !== undefined &&
      (flowPorts as readonly string[]).includes(resolvedId)
    ) {
      return { id: resolvedId, role: "flow", dataType: "flow" };
    }
    const dataPort = flowDataInputPorts(kind, data, context).find(
      (port) => port.id === resolvedId,
    );
    return dataPort === undefined ? null : { ...dataPort, role: "data" };
  }
  const flowPorts = FLOW_NODE_PORTS[kind].outputs;
  const resolvedId =
    persistedPort ?? (flowPorts.length === 1 ? flowPorts[0] : undefined);
  if (
    resolvedId !== undefined &&
    (flowPorts as readonly string[]).includes(resolvedId)
  ) {
    return { id: resolvedId, role: "flow", dataType: "flow" };
  }
  const dataPort = flowDataOutputPorts(kind, data, context).find(
    (port) => port.id === resolvedId,
  );
  return dataPort === undefined ? null : { ...dataPort, role: "data" };
}

export function areFlowDataTypesCompatible(
  output: FlowDataType,
  input: FlowDataType,
): boolean {
  return output === "any" || input === "any" || output === input;
}

export type FlowValidationIssueKind =
  | "duplicate-node-id"
  | "duplicate-edge-id"
  | "missing-start"
  | "multiple-starts"
  | "missing-end"
  | "multiple-ends"
  | "missing-output"
  | "missing-endpoint"
  | "invalid-port"
  | "incompatible-port-role"
  | "incompatible-port-type"
  | "illegal-port-count"
  | "invalid-loop-back"
  | "illegal-incoming"
  | "illegal-outgoing"
  | "cycle"
  | "unreachable-node"
  | "missing-param-name"
  | "invalid-param-name"
  | "duplicate-param-name"
  | "invalid-data-type"
  | "invalid-default-value"
  | "duplicate-result-name"
  | "inconsistent-output-ports"
  | "missing-call-target"
  | "unknown-call-target"
  | "invalid-call-target"
  | "missing-call-argument"
  | "call-cycle"
  | "missing-constant-source"
  | "unknown-constant-source"
  | "invalid-constant-source"
  | "missing-reference-source"
  | "unknown-reference-source"
  | "invalid-reference-source";

export interface FlowValidationIssue {
  kind: FlowValidationIssueKind;
  message: string;
  nodeId?: string;
  edgeId?: string;
  port?: string;
}

const FlowPositionSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .strict();

const FlowNodeDataSchema = z.intersection(
  z.object({ kind: z.enum(FLOW_NODE_KINDS) }),
  JsonObjectSchema,
);

export const FlowNodeSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(FLOW_NODE_KINDS),
    position: FlowPositionSchema,
    data: FlowNodeDataSchema,
    parentId: z.string().min(1).optional(),
    width: z.number().finite().positive().optional(),
    height: z.number().finite().positive().optional(),
  })
  .strict()
  .superRefine((node, ctx) => {
    if (node.data.kind !== node.type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data", "kind"],
        message: `Node data kind "${node.data.kind}" does not match node type "${node.type}".`,
      });
    }
  });

export const FlowEdgeSchema = z
  .object({
    id: z.string().min(1),
    source: z.string().min(1),
    target: z.string().min(1),
    sourceHandle: z.string().min(1).optional(),
    targetHandle: z.string().min(1).optional(),
    type: z.string().min(1).optional(),
  })
  .strict();

export const FlowViewportSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    zoom: z.number().finite().positive(),
  })
  .strict();

export const FlowDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    nodes: z.array(FlowNodeSchema),
    edges: z.array(FlowEdgeSchema),
    viewport: FlowViewportSchema.optional(),
  })
  .strict();

export type FlowNode = z.infer<typeof FlowNodeSchema>;
export type FlowEdge = z.infer<typeof FlowEdgeSchema>;
export type FlowViewport = z.infer<typeof FlowViewportSchema>;
export type FlowDocument = z.infer<typeof FlowDocumentSchema>;

/** Resolves a generic reference to the original node's effective payload. */
export function resolveNodeReference(
  sourceNodeId: string,
  nodes: ReadonlyMap<string, Pick<FlowNode, "type" | "data">>,
  visiting: ReadonlySet<string> = new Set(),
): FlowNodeReference | null {
  if (visiting.has(sourceNodeId)) {
    return null;
  }
  const source = nodes.get(sourceNodeId);
  if (source === undefined) {
    return null;
  }
  const nextVisiting = new Set(visiting);
  nextVisiting.add(sourceNodeId);
  const nestedSourceId = source.data.sourceNodeId;
  if (source.type === "constant-ref") {
    return typeof nestedSourceId === "string"
      ? resolveNodeReference(nestedSourceId, nodes, nextVisiting)
      : null;
  }
  if (typeof nestedSourceId !== "string") {
    return { type: source.type, data: source.data };
  }
  const nested = resolveNodeReference(nestedSourceId, nodes, nextVisiting);
  return nested?.type === source.type ? nested : null;
}

function flowNodeDataForReference(
  kind: FlowNodeKind,
  data: DynamicPortData,
  context?: FlowPortContext,
): DynamicPortData {
  // constant-ref is the legacy output-only node kept for drafts created by
  // the first version of this feature. New references retain their source
  // block's kind and use the generic resolver below.
  if (kind === "constant-ref") {
    return data;
  }
  const sourceNodeId = data?.sourceNodeId;
  if (typeof sourceNodeId !== "string") {
    return data;
  }
  const resolved = context?.resolveNodeReference?.(sourceNodeId);
  return resolved?.type === kind ? resolved.data : data;
}

/**
 * Resolves a constant reference through the current document snapshot. The
 * recursion guard keeps malformed legacy documents from hanging the editor
 * or runtime when references form a cycle.
 */
export function resolveConstantReference(
  sourceNodeId: string,
  nodes: ReadonlyMap<string, Pick<FlowNode, "type" | "data">>,
  visiting: ReadonlySet<string> = new Set(),
): FlowConstantReference | null {
  if (visiting.has(sourceNodeId)) {
    return null;
  }
  const source = nodes.get(sourceNodeId);
  if (source === undefined) {
    return null;
  }
  const nextVisiting = new Set(visiting);
  nextVisiting.add(sourceNodeId);
  if (source.type === "constant") {
    return constantReferenceFromData(source.data);
  }
  if (source.type !== "constant-ref") {
    return null;
  }
  const nextSourceId = source.data.sourceNodeId;
  return typeof nextSourceId === "string"
    ? resolveConstantReference(nextSourceId, nodes, nextVisiting)
    : null;
}

export const EMPTY_FLOW_DOCUMENT: FlowDocument = {
  schemaVersion: 1,
  nodes: [
    {
      id: "start",
      type: "start",
      position: { x: 0, y: 0 },
      data: { kind: "start" },
    },
    {
      id: "end",
      type: "end",
      position: { x: 320, y: 0 },
      data: { kind: "end" },
    },
  ],
  edges: [
    {
      id: "start-end",
      source: "start",
      target: "end",
      sourceHandle: "next",
      targetHandle: "in",
    },
  ],
};

export const CreateProjectInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
});

export const ListScriptsInputSchema = z.object({
  projectId: z.string().min(1),
});

function isCanonicalPosixPath(value: string): boolean {
  if (!value.startsWith("/")) {
    return false;
  }
  if (value === "/") {
    return false;
  }
  if (value.includes("\\")) {
    return false;
  }
  if (value.endsWith("/")) {
    return false;
  }
  const segments = value.slice(1).split("/");
  return segments.every(
    (segment) => segment.length > 0 && segment !== "." && segment !== "..",
  );
}

export const CreateScriptInputSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1).max(500),
  path: z
    .string()
    .min(1)
    .max(2000)
    .refine(isCanonicalPosixPath, {
      message:
        "Path must be a canonical absolute POSIX-like path (for example /flows/main.json).",
    }),
});

export const RenameProjectInputSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1).max(200),
});

export const DeleteProjectInputSchema = z.object({
  projectId: z.string().min(1),
});

export const GetScriptInputSchema = z.object({
  scriptId: z.string().min(1),
});

export const RenameScriptInputSchema = z.object({
  scriptId: z.string().min(1),
  name: z.string().trim().min(1).max(500),
});

export const DeleteScriptInputSchema = z.object({
  scriptId: z.string().min(1),
  projectId: z.string().min(1),
});

export const SaveScriptDraftInputSchema = z.object({
  scriptId: z.string().min(1),
  expectedDraftVersion: z.number().int().positive(),
  document: FlowDocumentSchema,
});

export const CreateRevisionInputSchema = z.object({
  scriptId: z.string().min(1),
  message: z.string().trim().max(500).nullable().optional(),
});

export const ListRevisionsInputSchema = z.object({
  scriptId: z.string().min(1),
});

export const RestoreRevisionInputSchema = z.object({
  scriptId: z.string().min(1),
  revisionId: z.string().min(1),
  expectedDraftVersion: z.number().int().positive(),
});

export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;
export type RenameProjectInput = z.infer<typeof RenameProjectInputSchema>;
export type DeleteProjectInput = z.infer<typeof DeleteProjectInputSchema>;
export type ListScriptsInput = z.infer<typeof ListScriptsInputSchema>;
export type CreateScriptInput = z.infer<typeof CreateScriptInputSchema>;
export type GetScriptInput = z.infer<typeof GetScriptInputSchema>;
export type RenameScriptInput = z.infer<typeof RenameScriptInputSchema>;
export type DeleteScriptInput = z.infer<typeof DeleteScriptInputSchema>;
export type SaveScriptDraftInput = z.infer<typeof SaveScriptDraftInputSchema>;
export type CreateRevisionInput = z.infer<typeof CreateRevisionInputSchema>;
export type ListRevisionsInput = z.infer<typeof ListRevisionsInputSchema>;
export type RestoreRevisionInput = z.infer<typeof RestoreRevisionInputSchema>;

export interface ProjectDto {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScriptDto {
  id: string;
  projectId: string;
  name: string;
  path: string;
  draftVersion: number;
  draftDocument: FlowDocument;
  createdAt: string;
  updatedAt: string;
}

export interface RevisionDto {
  id: string;
  scriptId: string;
  revisionNumber: number;
  draftDocument: FlowDocument;
  draftVersion: number;
  message: string | null;
  createdAt: string;
}

export type CreateScriptFailure = "project-not-found" | "path-conflict";

export type CreateScriptResult =
  | { status: "ok"; script: ScriptDto }
  | { status: "error"; error: CreateScriptFailure };

export type RenameProjectFailure = "project-not-found";

export type RenameProjectResult =
  | { status: "ok"; project: ProjectDto }
  | { status: "error"; error: RenameProjectFailure };

export type DeleteProjectFailure = "project-not-found";

export type DeleteProjectResult =
  | { status: "ok" }
  | { status: "error"; error: DeleteProjectFailure };

export type RenameScriptFailure = "script-not-found";

export type RenameScriptResult =
  | { status: "ok"; script: ScriptDto }
  | { status: "error"; error: RenameScriptFailure };

export type DeleteScriptFailure = "script-not-found";

export type DeleteScriptResult =
  | { status: "ok" }
  | { status: "error"; error: DeleteScriptFailure };

export type SaveScriptDraftFailure = "script-not-found" | "stale-draft";

export type SaveScriptDraftResult =
  | { status: "ok"; script: ScriptDto }
  | { status: "error"; error: SaveScriptDraftFailure };

export type CreateRevisionFailure = "script-not-found";

export type CreateRevisionResult =
  | { status: "ok"; revision: RevisionDto }
  | { status: "error"; error: CreateRevisionFailure };

export type RestoreRevisionFailure =
  | "script-not-found"
  | "revision-not-found"
  | "stale-draft";

export type RestoreRevisionResult =
  | { status: "ok"; script: ScriptDto }
  | { status: "error"; error: RestoreRevisionFailure };
