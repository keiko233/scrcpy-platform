import { useEffect, useMemo, useState } from "react";
import useAsync from "react-use/lib/useAsync";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { BugIcon, InfoIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { LogEntry, LogLevel } from "@/shared/electron-api";
import { LogMessage } from "./log-message";

export function DebugSettingsTab() {
  const { value: system } = useAsync(
    () => window.androidPlatform.getSystemInfo(),
    [],
  );
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [level, setLevel] = useState<LogLevel | "all">("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    void window.androidPlatform.listLogs().then((entries) => {
      if (active) setLogs(entries);
    });
    const unsubscribe = window.androidPlatform.onLog((entry) => {
      setLogs((current) => [entry, ...current].slice(0, 500));
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const visibleLogs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return logs.filter(
      (entry) =>
        (level === "all" || entry.level === level) &&
        (!normalizedQuery ||
          entry.message.toLowerCase().includes(normalizedQuery)),
    );
  }, [level, logs, query]);

  async function clearLogs(): Promise<void> {
    await window.androidPlatform.clearLogs();
    setLogs([]);
  }

  const levelClassName: Record<LogLevel, string> = {
    debug: "text-muted-foreground",
    info: "text-info-foreground",
    warn: "text-warning-foreground",
    error: "text-destructive-foreground",
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-1.5 border-b p-2">
        <BugIcon className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Logs</span>

        <span className="text-[10px] text-muted-foreground">
          {visibleLogs.length}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <select
            aria-label="Log level"
            value={level}
            onChange={(event) =>
              setLevel(event.target.value as LogLevel | "all")
            }
            className="h-7 rounded-md border bg-background px-1.5 text-[11px]"
          >
            <option value="all">All</option>
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>

          <Button
            variant="ghost"
            size="icon-xs"
            title="Clear logs"
            onClick={() => void clearLogs()}
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
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter logs"
            className="h-7 pl-7 text-[11px]"
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 font-mono text-[10px]">
        {visibleLogs.length === 0 ? (
          <div className="p-3 text-muted-foreground">No logs</div>
        ) : (
          visibleLogs.map((entry) => (
            <div
              key={entry.id}
              className="border-b px-2 py-1.5 last:border-b-0"
            >
              <div className="flex gap-2 text-[9px] text-muted-foreground">
                <span>{entry.createdAt}</span>
                <span className={levelClassName[entry.level]}>
                  {entry.level.toUpperCase()}
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
