import type { ComponentType } from "react";

import { DebugScreen } from "@/features/workbench/debug/debug-tab";
import { WorkbenchScreen } from "@/features/workbench/workbench-screen";
import { SettingsScreen } from "@/features/settings/settings-screen";

import { TABS, type TabId } from "./tabs";
import { useActiveTabId } from "./use-active-tab";

const SCREENS: Record<TabId, ComponentType> = {
  workbench: WorkbenchScreen,
  debug: DebugScreen,
  settings: SettingsScreen,
};

export function ScreenHost() {
  const activeId = useActiveTabId();

  return (
    <div className="min-h-0 flex-1">
      {TABS.map((tab) => {
        const Component = SCREENS[tab.id];
        return (
          <div key={tab.id} hidden={tab.id !== activeId} className="h-full">
            <Component />
          </div>
        );
      })}
    </div>
  );
}
