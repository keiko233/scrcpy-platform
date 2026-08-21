import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

import { WORKSPACES } from "./tabs";
import { useActiveTabId } from "./use-active-tab";

export function WorkspaceActions() {
  const activeId = useActiveTabId();

  return (
    <div className="app-no-drag flex h-full items-center gap-0.5 px-1">
      {WORKSPACES.filter((workspace) => workspace.id !== "workbench").map(
        (workspace) => {
          const Icon = workspace.icon;
          const active = workspace.id === activeId;
          return (
            <Link
              key={workspace.id}
              aria-label={workspace.id}
              className={cn(
                "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                active && "bg-accent text-foreground",
              )}
              params={{ tab: workspace.id }}
              title={workspace.id}
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
