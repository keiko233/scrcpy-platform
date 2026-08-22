import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import { WORKSPACES } from "@/features/shell/tabs";
import { useActiveTabId } from "@/features/shell/use-active-tab";
import { m } from "@/paraglide/messages.js";

function getWorkspaceLabel(id: string): string {
  switch (id) {
    case "workbench":
      return m.workspace_workbench();
    case "debug":
      return m.workspace_debug();
    case "settings":
      return m.workspace_settings();
    default:
      return id;
  }
}

export function WorkspaceActions() {
  const activeId = useActiveTabId();

  return (
    <div className="app-no-drag flex h-full items-center gap-0.5 px-1">
      {WORKSPACES.filter((workspace) => workspace.id !== "workbench").map(
        (workspace) => {
          const Icon = workspace.icon;
          const active = workspace.id === activeId;
          const label = getWorkspaceLabel(workspace.id);
          return (
            <Link
              key={workspace.id}
              aria-label={label}
              className={cn(
                "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                active && "bg-accent text-foreground",
              )}
              params={{ tab: workspace.id }}
              title={label}
              to="/$tab"
            >
              <Icon className="size-4" />
            </Link>
          );
        },
      )}
    </div>
  );
}
