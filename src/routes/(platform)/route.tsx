import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import {
  deviceSessionQueryFn,
  deviceSessionQueryKey,
} from "@/hooks/query/use-device-session";
import { Titlebar } from "@/features/shell/titlebar";

import { DeviceStatus } from "./_modules/device-status";
import { DisplayTabs } from "./_modules/display-tabs";
import { WorkspaceActions } from "./_modules/workspace-actions";
import { WorkbenchProvider } from "./_modules/workbench-provider";

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
  beforeLoad: async ({ context }) => {
    const state = await context.queryClient
      .fetchQuery({
        queryKey: deviceSessionQueryKey,
        queryFn: deviceSessionQueryFn,
      })
      .then((session) => session.state)
      .catch(() => "disconnected" as const);
    if (state !== "connected") {
      throw redirect({ to: "/pair" });
    }
  },
});
