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
  "launch-app",
  "set-variable",
  "calculate",
  "convert",
  "if",
  "merge",
  "for",
  "while",
  "assert",
  "screen-region",
] as const;

export type FlowNodeKind = (typeof FLOW_NODE_KINDS)[number];

export const FLOW_NODE_PORTS = {
  start: { inputs: [], outputs: ["next"] },
  end: { inputs: ["in"], outputs: [] },
  click: { inputs: ["in"], outputs: ["next"] },
  swipe: { inputs: ["in"], outputs: ["next"] },
  ocr: { inputs: ["in"], outputs: ["next"] },
  delay: { inputs: ["in"], outputs: ["next"] },
  "launch-app": { inputs: ["in"], outputs: ["next"] },
  "set-variable": { inputs: ["in"], outputs: ["next"] },
  calculate: { inputs: ["in"], outputs: ["next"] },
  convert: { inputs: ["in"], outputs: ["next"] },
  if: { inputs: ["in"], outputs: ["true", "false"] },
  merge: { inputs: [], outputs: ["next"] },
  for: { inputs: ["in", "loop"], outputs: ["body", "done"] },
  while: { inputs: ["in", "loop"], outputs: ["body", "done"] },
  assert: { inputs: ["in"], outputs: ["next"] },
  "screen-region": { inputs: [], outputs: [] },
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
  "launch-app": {
    inputs: [
      dataPort("packageName", "Package", "string"),
      dataPort("activity", "Activity", "string"),
    ],
    outputs: [],
  },
  "set-variable": {
    inputs: [dataPort("expression", "Value", "any")],
    outputs: [outputPort("value", "Value", "any")],
  },
  calculate: {
    inputs: [],
    outputs: [outputPort("value", "Value", "number")],
  },
  convert: {
    inputs: [dataPort("value", "Value", "any")],
    outputs: [outputPort("value", "Value", "any")],
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
  assert: {
    inputs: [
      dataPort("condition", "Condition", "boolean"),
      dataPort("message", "Message", "string"),
    ],
    outputs: [],
  },
  "screen-region": {
    inputs: [],
    outputs: [outputPort("region", "Region", "screen-region")],
  },
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
): number | null {
  const config =
    FLOW_NODE_DYNAMIC_INPUTS[kind] ?? FLOW_NODE_DYNAMIC_FLOW_INPUTS[kind];
  return config === undefined ? null : dynamicPortCount(data, config);
}

/** All flow input port ids for a node, including any dynamic flow inputs. */
export function flowInputPortIds(
  kind: FlowNodeKind,
  data: DynamicPortData,
): string[] {
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

/** All data input ports for a node, including any dynamic data inputs. */
export function flowDataInputPorts(
  kind: FlowNodeKind,
  data: DynamicPortData,
): FlowDataPortDefinition[] {
  const inputs = [...FLOW_NODE_DATA_PORTS[kind].inputs];
  const config = FLOW_NODE_DYNAMIC_INPUTS[kind];
  if (config !== undefined) {
    const count = dynamicPortCount(data, config);
    for (let index = 0; index < count; index += 1) {
      const id = flowDynamicPortId(index);
      inputs.push({ id, label: id, dataType: config.dataType });
    }
  }
  return inputs;
}

export type ResolvedFlowPort =
  | { id: string; role: "flow"; dataType: "flow" }
  | ({ role: "data" } & FlowDataPortDefinition);

export function resolveFlowPort(
  kind: FlowNodeKind,
  direction: FlowPortDirection,
  persistedPort: string | undefined,
  data?: DynamicPortData,
): ResolvedFlowPort | null {
  if (direction === "input") {
    const flowPorts = flowInputPortIds(kind, data);
    const resolvedId =
      persistedPort ?? (flowPorts.length === 1 ? flowPorts[0] : undefined);
    if (
      resolvedId !== undefined &&
      (flowPorts as readonly string[]).includes(resolvedId)
    ) {
      return { id: resolvedId, role: "flow", dataType: "flow" };
    }
    const dataPort = flowDataInputPorts(kind, data).find(
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
  const dataPort = FLOW_NODE_DATA_PORTS[kind].outputs.find(
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

export const GetScriptInputSchema = z.object({
  scriptId: z.string().min(1),
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
export type ListScriptsInput = z.infer<typeof ListScriptsInputSchema>;
export type CreateScriptInput = z.infer<typeof CreateScriptInputSchema>;
export type GetScriptInput = z.infer<typeof GetScriptInputSchema>;
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
