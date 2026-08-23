import { useMemo } from "react";

import { BugIcon, SearchIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LogMessage } from "@/features/workbench/debug/log-message";
import { useLogs } from "@/hooks/query/use-logs";
import { m } from "@/paraglide/messages.js";
import type { LogLevel } from "@/shared/electron-api";

import { Route, type DebugSearch } from "../index";

export function DebugScreen() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { logs, clearLogs } = useLogs();

  const query = search.q ?? "";

  const visibleLogs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return logs.filter(
      (entry) =>
        (search.level === "all" || entry.level === search.level) &&
        (!normalizedQuery ||
          entry.message.toLowerCase().includes(normalizedQuery)),
    );
  }, [logs, query, search.level]);

  function handleClearLogs(): void {
    void clearLogs();
  }

  function updateSearch(patch: Partial<DebugSearch>): void {
    void navigate({
      search: (prev) => ({ ...prev, ...patch }),
      replace: true,
    });
  }

  const levelClassName: Record<LogLevel, string> = {
    trace: "text-muted-foreground/70",
    debug: "text-muted-foreground",
    info: "text-info-foreground",
    warn: "text-warning-foreground",
    error: "text-destructive-foreground",
  };

  function getLevelLabel(level: LogLevel): string {
    switch (level) {
      case "trace":
        return m.debug_level_trace();
      case "debug":
        return m.debug_level_debug();
      case "info":
        return m.debug_level_info();
      case "warn":
        return m.debug_level_warn();
      case "error":
        return m.debug_level_error();
      default:
        return level;
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-1.5 border-b p-2">
        <BugIcon className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">{m.debug_logs_title()}</span>

        <span className="text-[10px] text-muted-foreground">
          {visibleLogs.length}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <select
            aria-label={m.debug_log_level_aria()}
            value={search.level}
            onChange={(event) =>
              updateSearch({
                level: event.target.value as DebugSearch["level"],
              })
            }
            className="h-7 rounded-md border bg-background px-1.5 text-[11px]"
          >
            <option value="all">{m.debug_level_all()}</option>
            <option value="trace">{m.debug_level_trace()}</option>
            <option value="debug">{m.debug_level_debug()}</option>
            <option value="info">{m.debug_level_info()}</option>
            <option value="warn">{m.debug_level_warn()}</option>
            <option value="error">{m.debug_level_error()}</option>
          </select>

          <Button
            variant="ghost"
            size="icon-xs"
            title={m.debug_clear_logs()}
            onClick={() => handleClearLogs()}
          >
            <Trash2Icon />
          </Button>
        </div>
      </div>

      <div className="border-b p-2">
        <div className="relative">
          <SearchIcon className="absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />

          <Input
            value={query}
            onChange={(event) => updateSearch({ q: event.target.value })}
            placeholder={m.debug_filter_placeholder()}
            className="h-7 pl-7 text-[11px]"
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 font-mono text-[10px]">
        {visibleLogs.length === 0 ? (
          <div className="p-3 text-muted-foreground">{m.debug_no_logs()}</div>
        ) : (
          visibleLogs.map((entry) => (
            <div
              key={entry.id}
              className="border-b px-2 py-1.5 last:border-b-0"
            >
              <div className="flex gap-2 text-[9px] text-muted-foreground">
                <span>{entry.createdAt}</span>
                <span className={levelClassName[entry.level]}>
                  {getLevelLabel(entry.level)}
                </span>

                <span className="text-muted-foreground">[{entry.source}]</span>

                {entry.location && (
                  <span
                    className="truncate text-fuchsia-700 dark:text-fuchsia-300"
                    title={entry.location}
                  >
                    {entry.location}
                  </span>
                )}
              </div>

              <LogMessage message={entry.message} />
            </div>
          ))
        )}
      </ScrollArea>
    </div>
  );
}
