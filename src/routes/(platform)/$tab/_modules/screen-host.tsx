import type { ComponentType } from "react";

import { WORKSPACES, type TabId } from "@/features/shell/tabs";
import { useActiveTabId } from "@/features/shell/use-active-tab";

import { DebugScreen } from "./debug-screen";
import { SettingsScreen } from "./settings-screen";
import { WorkbenchScreen } from "./workbench-screen";

const SCREENS: Record<TabId, ComponentType> = {
  workbench: WorkbenchScreen,
  debug: DebugScreen,
  settings: SettingsScreen,
};

export function ScreenHost() {
  const activeId = useActiveTabId();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {WORKSPACES.map((workspace) => {
        const Component = SCREENS[workspace.id];
        return (
          <div
            key={workspace.id}
            hidden={workspace.id !== activeId}
            className="min-h-0 flex-1"
          >
            <Component />
          </div>
        );
      })}
    </div>
  );
}
