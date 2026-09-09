import { Link } from "@tanstack/react-router";
import { SettingsIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { WORKSPACES } from "@/features/shell/tabs";
import { useActiveTabId } from "@/features/shell/use-active-tab";
import { useWindowContext } from "@/hooks/query/use-window-context";
import { m } from "@/paraglide/messages.js";

const TAB_ROUTES: Record<string, "/debug" | "/settings"> = {
  debug: "/debug",
  settings: "/settings",
};

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
  const contextQuery = useWindowContext();
  const isScreenWindow = contextQuery.data?.context.kind === "screen";

  if (isScreenWindow) {
    return (
      <div className="app-no-drag flex h-full items-center gap-0.5 px-1">
        <button
          type="button"
          aria-label={m.workspace_settings()}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title={m.workspace_settings()}
          onClick={() => void window.scrcpyPlatform.openSettingsWindow()}
        >
          <SettingsIcon className="size-4" />
        </button>
      </div>
    );
  }

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
              title={label}
              to={TAB_ROUTES[workspace.id]}
            >
              <Icon className="size-4" />
            </Link>
          );
        },
      )}
    </div>
  );
}
