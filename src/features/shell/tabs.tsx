import {
  BugIcon,
  MonitorIcon,
  SettingsIcon,
  type LucideIcon,
} from "lucide-react";

export type TabId = "workbench" | "debug" | "settings";

export interface TabDefinition {
  id: TabId;
  label: string;
  icon: LucideIcon;
}

export const TABS: readonly TabDefinition[] = [
  { id: "workbench", label: "Workbench", icon: MonitorIcon },
  { id: "debug", label: "Debug", icon: BugIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export function isTabId(value: string): value is TabId {
  return TABS.some((tab) => tab.id === value);
}
