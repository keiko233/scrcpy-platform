import { createFileRoute, redirect } from "@tanstack/react-router";

import { ScreenHost } from "@/features/shell/screen-host";
import { isTabId } from "@/features/shell/tabs";

export const Route = createFileRoute("/(platform)/$tab/")({
  component: ScreenHost,
  beforeLoad: ({ params }) => {
    if (!isTabId(params.tab)) {
      throw redirect({ to: "/$tab", params: { tab: "workbench" } });
    }
  },
});
