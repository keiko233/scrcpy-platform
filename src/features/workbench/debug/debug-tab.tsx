import { useEffect, useMemo, useState } from "react";
import useAsync from "react-use/lib/useAsync";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { BugIcon, InfoIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    return logs.filter((entry) =>
      (level === "all" || entry.level === level) &&
      (!normalizedQuery || entry.message.toLowerCase().includes(normalizedQuery)),
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
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-2">
      <Alert variant="info" className="gap-1.5 px-2.5 py-2 text-xs">
        <InfoIcon />
        <AlertTitle className="text-xs">Background runtime</AlertTitle>
        <AlertDescription className="text-[11px]">
          The automation runtime is not implemented yet. Run stays disabled and
          blocks cannot execute until it exists.
        </AlertDescription>
      </Alert>

      <Alert variant="info" className="gap-1.5 px-2.5 py-2 text-xs">
        <InfoIcon />
        <AlertTitle className="text-xs">Screen capture</AlertTitle>
        <AlertDescription className="text-[11px]">
          scrcpy video is not wired up. The monitor panel will show a live frame
          once a capture source is configured.
        </AlertDescription>
      </Alert>

      <div className="rounded-lg border p-2">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium">
          <BugIcon className="size-3.5 text-muted-foreground" />
          Runtime &amp; system
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
          <dt className="text-muted-foreground">Runtime</dt>
          <dd>{system?.runtime ?? "—"}</dd>
          <dt className="text-muted-foreground">Platform</dt>
          <dd>{system?.platform ?? "—"}</dd>
          <dt className="text-muted-foreground">Electron</dt>
          <dd>{system?.versions.electron ?? "—"}</dd>
          <dt className="text-muted-foreground">Chrome</dt>
          <dd>{system?.versions.chrome ?? "—"}</dd>
          <dt className="text-muted-foreground">Node</dt>
          <dd>{system?.versions.node ?? "—"}</dd>
        </dl>
      </div>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border">
        <div className="flex shrink-0 items-center gap-1.5 border-b p-2">
          <BugIcon className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Logs</span>
          <span className="text-[10px] text-muted-foreground">{visibleLogs.length}</span>
          <div className="ml-auto flex items-center gap-1">
            <select
              aria-label="Log level"
              value={level}
              onChange={(event) => setLevel(event.target.value as LogLevel | "all")}
              className="h-7 rounded-md border bg-background px-1.5 text-[11px]"
            >
              <option value="all">All</option>
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
            </select>
            <Button variant="ghost" size="icon-xs" title="Clear logs" onClick={() => void clearLogs()}>
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
        <div className="min-h-0 flex-1 overflow-y-auto font-mono text-[10px]">
          {visibleLogs.length === 0 ? (
            <div className="p-3 text-muted-foreground">No logs</div>
          ) : (
            visibleLogs.map((entry) => (
              <div key={entry.id} className="border-b px-2 py-1.5 last:border-b-0">
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
        </div>
      </section>

      <div className="mt-auto flex items-center gap-2 text-[11px] text-muted-foreground">
        <Badge size="sm" variant="outline">
          graph
        </Badge>
        schema v1 · JSON persisted
      </div>
    </div>
  );
}
