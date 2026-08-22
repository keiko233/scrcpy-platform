import { useEffect, useMemo, useRef, useState } from "react";

import {
  BugIcon,
  PauseIcon,
  PlayIcon,
  SquareIcon,
  StepForwardIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { FlowRunLogEntryDto, FlowRunLogLevel } from "@/shared/run-contracts";

import { useWorkbench } from "../use-workbench";
import { LogMessage } from "./log-message";

const LEVEL_CLASS_NAMES: Record<FlowRunLogLevel, string> = {
  debug: "text-muted-foreground",
  info: "text-info-foreground",
  warn: "text-warning-foreground",
  error: "text-destructive-foreground",
};

function stateVariant(
  state: string | undefined,
): "default" | "secondary" | "success" | "error" | "warning" | "info" {
  switch (state) {
    case "running":
      return "info";
    case "paused":
      return "warning";
    case "completed":
      return "success";
    case "failed":
      return "error";
    case "cancelled":
      return "secondary";
    default:
      return "default";
  }
}

export function RunPanel() {
  const { library, flow, devices, screens, runs } = useWorkbench();
  const { selectedScript } = library;
  const session = devices.session;
  const displayId = screens.screen?.activeDisplayId ?? null;

  const running = runs.run?.state === "running";
  const paused = runs.run?.state === "paused";
  const active = running || paused;

  const [level, setLevel] = useState<FlowRunLogLevel | "all">("all");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const canRun =
    selectedScript !== null &&
    !flow.dirty &&
    !runs.busy &&
    session?.state === "connected" &&
    session.transportId !== null &&
    displayId !== null;

  const start = () => {
    if (
      !canRun ||
      selectedScript === null ||
      session?.transportId === null ||
      session?.transportId === undefined ||
      displayId === null
    ) {
      return;
    }
    void runs.start({
      scriptId: selectedScript.id,
      deviceId: session.transportId,
      sessionId: session.sessionId,
      displayId,
    });
  };

  const visibleLogs = useMemo(
    () =>
      level === "all"
        ? runs.logs
        : runs.logs.filter((entry) => entry.level === level),
    [level, runs.logs],
  );

  useEffect(() => {
    const element = scrollRef.current;
    if (element !== null) {
      element.scrollTop = element.scrollHeight;
    }
  }, [visibleLogs.length]);

  const runTooltip = runs.error ??
    (selectedScript === null
      ? "Select a script to run"
      : flow.dirty
        ? "Save the draft before running it"
        : session?.state !== "connected"
          ? "Connect an Android device before running"
          : displayId === null
            ? "Select an Android display before running"
            : "Run the flow with the selected breakpoints");

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <div className="flex shrink-0 items-center gap-1.5 border-b px-2 py-1.5">
        <BugIcon className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Run</span>
        {runs.run !== null && (
          <Badge size="sm" variant={stateVariant(runs.run.state)}>
            {runs.run.state}
          </Badge>
        )}
        {runs.breakpoints.size > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {runs.breakpoints.size} breakpoint
            {runs.breakpoints.size === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 border-b px-2 py-1.5">
        {active ? (
          <>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="sm"
                    variant="default"
                    disabled={!paused || runs.busy}
                    onClick={() => void runs.resume("continue")}
                  >
                    <PlayIcon />
                    Continue
                  </Button>
                }
              />
              <TooltipContent>Resume to the next breakpoint</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!paused || runs.busy}
                    onClick={() => void runs.resume("step")}
                  >
                    <StepForwardIcon />
                    Step
                  </Button>
                }
              />
              <TooltipContent>Advance one node, then pause</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="sm"
                    variant="destructive-outline"
                    disabled={runs.busy}
                    onClick={() => void runs.stop()}
                  >
                    <SquareIcon />
                    Stop
                  </Button>
                }
              />
              <TooltipContent>Cancel the active run</TooltipContent>
            </Tooltip>
          </>
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="sm"
                  variant="default"
                  disabled={!canRun}
                  onClick={start}
                >
                  <PlayIcon />
                  Run
                </Button>
              }
            />
            <TooltipContent>{runTooltip}</TooltipContent>
          </Tooltip>
        )}

        {paused && <PauseIcon className="size-3.5 text-warning-foreground" />}

        <div className="ml-auto flex items-center gap-1">
          <select
            aria-label="Run log level"
            value={level}
            onChange={(event) =>
              setLevel(event.target.value as FlowRunLogLevel | "all")
            }
            className="h-7 rounded-md border bg-background px-1.5 text-[11px]"
          >
            <option value="all">All</option>
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto font-mono text-[10px]"
      >
        {visibleLogs.length === 0 ? (
          <div className="p-3 text-muted-foreground">
            {runs.run === null
              ? "No run yet. Click Run to execute the script."
              : "No logs for this run."}
          </div>
        ) : (
          visibleLogs.map((entry) => (
            <RunLogRow key={entry.id} entry={entry} />
          ))
        )}
      </div>
    </div>
  );
}

function RunLogRow({ entry }: { entry: FlowRunLogEntryDto }) {
  return (
    <div className="border-b px-2 py-1.5 last:border-b-0">
      <div className="flex gap-2 text-[9px] text-muted-foreground">
        <span>{entry.createdAt}</span>
        <span className={LEVEL_CLASS_NAMES[entry.level]}>
          {entry.level.toUpperCase()}
        </span>
        {entry.nodeId !== null && (
          <span
            className="truncate text-fuchsia-700 dark:text-fuchsia-300"
            title={entry.nodeId}
          >
            {entry.nodeId}
          </span>
        )}
      </div>
      <LogMessage message={entry.message} />
      {entry.data !== null && (
        <div className="mt-0.5">
          <LogMessage message={JSON.stringify(entry.data, null, 2)} />
        </div>
      )}
    </div>
  );
}
