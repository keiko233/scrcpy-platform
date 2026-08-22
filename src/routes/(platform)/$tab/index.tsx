import { createFileRoute, redirect } from "@tanstack/react-router";

import { isTabId } from "@/features/shell/tabs";

import { ScreenHost } from "./_modules/screen-host";

export const Route = createFileRoute("/(platform)/$tab/")({
  component: ScreenHost,
  beforeLoad: ({ params }) => {
    if (!isTabId(params.tab)) {
      throw redirect({ to: "/$tab", params: { tab: "workbench" } });
    }
  },
});
