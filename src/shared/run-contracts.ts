import { z } from "zod";

import {
  FLOW_NODE_KINDS,
  FlowDocumentSchema,
  JsonValueSchema,
} from "./project-contracts";
import type { FlowValidationIssue } from "./flow-graph";

export const StartFlowRunInputSchema = z
  .object({
    scriptId: z.string().min(1),
    deviceId: z.string().min(1),
    sessionId: z.string().min(1),
    displayId: z.number().int().nonnegative(),
    /** Optional current editor document for running unsaved changes. */
    document: FlowDocumentSchema.optional(),
    mode: z.enum(["flow", "single-node", "from-node"]).optional(),
    entryNodeId: z.string().min(1).optional(),
    breakpoints: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const StopFlowRunInputSchema = z
  .object({ runId: z.string().min(1) })
  .strict();

export const ResumeFlowRunInputSchema = z
  .object({
    runId: z.string().min(1),
    action: z.enum(["continue", "step"]),
  })
  .strict();

export type StartFlowRunInput = z.infer<typeof StartFlowRunInputSchema>;
export type StopFlowRunInput = z.infer<typeof StopFlowRunInputSchema>;
export type ResumeFlowRunInput = z.infer<typeof ResumeFlowRunInputSchema>;
export type ResumeAction = ResumeFlowRunInput["action"];

export const FlowRunModeSchema = z.enum(["flow", "single-node", "from-node"]);
export type FlowRunMode = z.infer<typeof FlowRunModeSchema>;

export const FlowRunStateSchema = z.enum([
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
]);
export const FlowRunStepStateSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
  "skipped",
]);

export const FlowRunStepDtoSchema = z
  .object({
    nodeId: z.string().min(1),
    kind: z.enum(FLOW_NODE_KINDS),
    state: FlowRunStepStateSchema,
    startedAt: z.string().datetime().nullable(),
    finishedAt: z.string().datetime().nullable(),
    error: z.string().nullable(),
    executionCount: z.number().int().nonnegative(),
  })
  .strict();

export const FlowRunDtoSchema = z
  .object({
    runId: z.string().min(1),
    scriptId: z.string().min(1),
    deviceId: z.string().min(1),
    sessionId: z.string().min(1),
    displayId: z.number().int().nonnegative(),
    mode: FlowRunModeSchema,
    entryNodeId: z.string().min(1).nullable(),
    state: FlowRunStateSchema,
    currentNodeId: z.string().min(1).nullable(),
    startedAt: z.string().datetime(),
    finishedAt: z.string().datetime().nullable(),
    error: z.string().nullable(),
    steps: z.array(FlowRunStepDtoSchema),
    /** Values returned through an Output node; null when the run ended on End. */
    result: JsonValueSchema.nullable().optional(),
  })
  .strict();

export type FlowRunState = z.infer<typeof FlowRunStateSchema>;
export type FlowRunStepState = z.infer<typeof FlowRunStepStateSchema>;
export type FlowRunStepDto = z.infer<typeof FlowRunStepDtoSchema>;
export type FlowRunDto = z.infer<typeof FlowRunDtoSchema>;

export const FlowRunLogLevelSchema = z.enum(["debug", "info", "warn", "error"]);

export const FlowRunLogEntryDtoSchema = z
  .object({
    id: z.number().int().positive(),
    runId: z.string().min(1),
    nodeId: z.string().min(1).nullable(),
    level: FlowRunLogLevelSchema,
    message: z.string(),
    data: JsonValueSchema.nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();

export type FlowRunLogLevel = z.infer<typeof FlowRunLogLevelSchema>;
export type FlowRunLogEntryDto = z.infer<typeof FlowRunLogEntryDtoSchema>;

export type FlowRunLogListener = (entry: FlowRunLogEntryDto) => void;

export type StartFlowRunFailure =
  | "script-not-found"
  | "device-not-connected"
  | "device-mismatch"
  | "session-mismatch"
  | "run-busy"
  | "invalid-flow";

export type StartFlowRunResult =
  | { status: "ok"; run: FlowRunDto }
  | {
      status: "error";
      error: StartFlowRunFailure;
      issues?: FlowValidationIssue[];
    };

export type StopFlowRunResult =
  | { status: "ok"; run: FlowRunDto }
  | { status: "error"; error: "run-not-found" };

export type ResumeFlowRunFailure = "run-not-found" | "run-not-paused";

export type ResumeFlowRunResult =
  | { status: "ok"; run: FlowRunDto }
  | { status: "error"; error: ResumeFlowRunFailure };

export type FlowRunListener = (run: FlowRunDto) => void;
