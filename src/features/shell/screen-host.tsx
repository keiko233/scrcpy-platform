import type { ComponentType } from "react";

import { DebugScreen } from "@/features/workbench/debug/debug-tab";
import { WorkbenchScreen } from "@/features/workbench/workbench-screen";
import { SettingsScreen } from "@/features/settings/settings-screen";

import { WORKSPACES, type TabId } from "./tabs";
import { useActiveTabId } from "./use-active-tab";

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
