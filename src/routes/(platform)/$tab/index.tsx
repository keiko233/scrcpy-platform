import { createFileRoute, redirect } from "@tanstack/react-router";

import { WorkbenchScreen } from "./_modules/workbench-screen";

export const Route = createFileRoute("/(platform)/$tab/")({
  component: WorkbenchScreen,
  beforeLoad: ({ params }) => {
    if (params.tab !== "workbench") {
      throw redirect({ to: "/$tab", params: { tab: "workbench" } });
    }
  },
});
