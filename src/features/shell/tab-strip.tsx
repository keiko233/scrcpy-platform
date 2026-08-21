import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

import { TABS } from "./tabs";
import { useActiveTabId } from "./use-active-tab";

export function TabStrip() {
  const activeId = useActiveTabId();

  return (
    <nav className="app-no-drag flex h-full items-center gap-0.5 px-1.5">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = tab.id === activeId;
        return (
          <Link
            key={tab.id}
            to="/$tab"
            params={{ tab: tab.id }}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
