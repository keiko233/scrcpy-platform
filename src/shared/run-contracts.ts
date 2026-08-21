import { z } from "zod";

import { FLOW_NODE_KINDS } from "./project-contracts";
import type { FlowValidationIssue } from "./flow-graph";

export const StartFlowRunInputSchema = z
  .object({
    scriptId: z.string().min(1),
    deviceId: z.string().min(1),
    sessionId: z.string().min(1),
    displayId: z.number().int().nonnegative(),
  })
  .strict();

export const StopFlowRunInputSchema = z
  .object({ runId: z.string().min(1) })
  .strict();

export type StartFlowRunInput = z.infer<typeof StartFlowRunInputSchema>;
export type StopFlowRunInput = z.infer<typeof StopFlowRunInputSchema>;

export const FlowRunStateSchema = z.enum([
  "running",
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
]);

export const FlowRunStepDtoSchema = z
  .object({
    nodeId: z.string().min(1),
    kind: z.enum(FLOW_NODE_KINDS),
    state: FlowRunStepStateSchema,
    startedAt: z.string().datetime().nullable(),
    finishedAt: z.string().datetime().nullable(),
    error: z.string().nullable(),
  })
  .strict();

export const FlowRunDtoSchema = z
  .object({
    runId: z.string().min(1),
    scriptId: z.string().min(1),
    deviceId: z.string().min(1),
    sessionId: z.string().min(1),
    displayId: z.number().int().nonnegative(),
    state: FlowRunStateSchema,
    currentNodeId: z.string().min(1).nullable(),
    startedAt: z.string().datetime(),
    finishedAt: z.string().datetime().nullable(),
    error: z.string().nullable(),
    steps: z.array(FlowRunStepDtoSchema),
  })
  .strict();

export type FlowRunState = z.infer<typeof FlowRunStateSchema>;
export type FlowRunStepState = z.infer<typeof FlowRunStepStateSchema>;
export type FlowRunStepDto = z.infer<typeof FlowRunStepDtoSchema>;
export type FlowRunDto = z.infer<typeof FlowRunDtoSchema>;

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

export type FlowRunListener = (run: FlowRunDto) => void;
