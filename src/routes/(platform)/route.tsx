import { createFileRoute, Outlet } from "@tanstack/react-router";

import { Titlebar } from "@/features/shell/titlebar";

import { DeviceStatus } from "./_modules/device-status";
import { DisplayTabs } from "./_modules/display-tabs";
import { WorkspaceActions } from "./_modules/workspace-actions";
import { WorkbenchProvider } from "./_modules/workbench-provider";

export const Route = createFileRoute("/(platform)")({
  component: PlatformRouteShell,
});

function PlatformRouteShell(): React.ReactElement {
  return (
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
  );
}
