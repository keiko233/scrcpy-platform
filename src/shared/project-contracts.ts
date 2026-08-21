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
  "if",
  "merge",
  "for",
  "while",
  "assert",
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
  if: { inputs: ["in"], outputs: ["true", "false"] },
  merge: { inputs: ["a", "b"], outputs: ["next"] },
  for: { inputs: ["in", "loop"], outputs: ["body", "done"] },
  while: { inputs: ["in", "loop"], outputs: ["body", "done"] },
  assert: { inputs: ["in"], outputs: ["next"] },
} as const satisfies Record<
  FlowNodeKind,
  { inputs: readonly string[]; outputs: readonly string[] }
>;

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
