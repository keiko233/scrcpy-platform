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

export const FlowNodeSchema = z.intersection(
  z.object({ id: z.string().min(1) }),
  JsonObjectSchema,
);

export const FlowEdgeSchema = z.intersection(
  z.object({ id: z.string().min(1) }),
  JsonObjectSchema,
);

export const FlowViewportSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  zoom: z.number().finite(),
});

export const FlowDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  nodes: z.array(FlowNodeSchema),
  edges: z.array(FlowEdgeSchema),
  viewport: FlowViewportSchema.optional(),
});

export type FlowNode = z.infer<typeof FlowNodeSchema>;
export type FlowEdge = z.infer<typeof FlowEdgeSchema>;
export type FlowViewport = z.infer<typeof FlowViewportSchema>;
export type FlowDocument = z.infer<typeof FlowDocumentSchema>;

export const EMPTY_FLOW_DOCUMENT: FlowDocument = {
  schemaVersion: 1,
  nodes: [],
  edges: [],
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
