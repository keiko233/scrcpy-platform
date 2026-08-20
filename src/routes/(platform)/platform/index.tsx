import { createFileRoute } from "@tanstack/react-router";

import { WorkbenchRoute } from "@/features/workbench/workbench-route";

export const Route = createFileRoute("/(platform)/platform/")({
  component: WorkbenchRoute,
});
