import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { DeviceStatus } from "@/features/shell/device-status";
import { DisplayTabs } from "@/features/shell/display-tabs";
import { Titlebar } from "@/features/shell/titlebar";
import { WorkspaceActions } from "@/features/shell/workspace-actions";
import { WorkbenchProvider } from "@/features/workbench/workbench-context";

import { getDeviceSessionState } from "../device-session-state";

export const Route = createFileRoute("/(platform)")({
  component: () => (
    <WorkbenchProvider>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
        <Titlebar
          actions={
            <>
              <WorkspaceActions />
              <DeviceStatus />
            </>
          }
        >
          <DisplayTabs />
        </Titlebar>
        <div className="flex min-h-0 flex-1 flex-col">
          <Outlet />
        </div>
      </div>
    </WorkbenchProvider>
  ),
  beforeLoad: async () => {
    if ((await getDeviceSessionState()) !== "connected") {
      throw redirect({ to: "/pair" });
    }
  },
});
