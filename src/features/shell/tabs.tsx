import { BugIcon, MonitorIcon, SettingsIcon, type LucideIcon } from "lucide-react";

export type TabId = "workbench" | "debug" | "settings";

export interface WorkspaceDefinition {
  id: TabId;
  icon: LucideIcon;
}

export const WORKSPACES: readonly WorkspaceDefinition[] = [
  { id: "workbench", icon: MonitorIcon },
  { id: "debug", icon: BugIcon },
  { id: "settings", icon: SettingsIcon },
];

export function isTabId(value: string): value is TabId {
  return WORKSPACES.some((workspace) => workspace.id === value);
}
