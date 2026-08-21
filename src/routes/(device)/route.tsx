import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { Titlebar } from "@/features/shell/titlebar";

import { getDeviceSessionState } from "../device-session-state";

export const Route = createFileRoute("/(device)")({
  component: () => (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <Titlebar />
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  ),
  beforeLoad: async () => {
    if ((await getDeviceSessionState()) === "connected") {
      throw redirect({ to: "/$tab", params: { tab: "workbench" } });
    }
  },
});
