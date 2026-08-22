import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { DebugScreen } from "./_modules/debug-screen";

const debugSearchSchema = z.object({
  level: z
    .enum(["all", "debug", "info", "warn", "error"])
    .default("all")
    .catch("all"),
  q: z.string().catch("").optional(),
});

export type DebugSearch = z.infer<typeof debugSearchSchema>;

export const Route = createFileRoute("/(platform)/debug/")({
  validateSearch: debugSearchSchema,
  component: DebugScreen,
});
