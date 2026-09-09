import { createFileRoute } from "@tanstack/react-router";

import { Titlebar } from "@/features/shell/titlebar";
import { DeviceStatus } from "../(platform)/_modules/device-status";
import { DisplayTabs } from "../(platform)/_modules/display-tabs";
import { WorkbenchProvider } from "../(platform)/_modules/workbench-provider";
import { WorkspaceActions } from "../(platform)/_modules/workspace-actions";
import { WorkbenchScreen } from "../(platform)/$tab/_modules/workbench-screen";

export const Route = createFileRoute("/(screen)/screen")({
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
        <div className="min-h-0 flex-1">
          <WorkbenchScreen />
        </div>
      </div>
    </WorkbenchProvider>
  ),
});
