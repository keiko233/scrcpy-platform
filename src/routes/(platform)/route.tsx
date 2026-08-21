import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { DeviceStatus } from "@/features/shell/device-status";
import { TabStrip } from "@/features/shell/tab-strip";
import { Titlebar } from "@/features/shell/titlebar";
import { WorkbenchProvider } from "@/features/workbench/workbench-context";

import { getDeviceSessionState } from "../device-session-state";

export const Route = createFileRoute("/(platform)")({
  component: () => (
    <WorkbenchProvider>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
        <Titlebar actions={<DeviceStatus />}>
          <TabStrip />
        </Titlebar>
        <div className="min-h-0 flex-1">
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
