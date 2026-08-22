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
import { m } from "@/paraglide/messages.js";

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

function getRunStateLabel(state: string): string {
  switch (state) {
    case "running":
      return m.run_state_running();
    case "paused":
      return m.run_state_paused();
    case "completed":
      return m.run_state_completed();
    case "failed":
      return m.run_state_failed();
    case "cancelled":
      return m.run_state_cancelled();
    default:
      return m.run_state_unknown();
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
      level === "all" ? runs.logs : runs.logs.filter((entry) => entry.level === level),
    [level, runs.logs],
  );

  useEffect(() => {
    const element = scrollRef.current;
    if (element !== null) {
      element.scrollTop = element.scrollHeight;
    }
  }, [visibleLogs.length]);

  const runTooltip =
    runs.error ??
    (selectedScript === null
      ? m.run_panel_select_script_to_run()
      : flow.dirty
        ? m.run_panel_save_before_run()
        : session?.state !== "connected"
          ? m.run_panel_connect_device_before_run()
          : displayId === null
            ? m.run_panel_select_display_before_run()
            : m.run_panel_run_with_breakpoints());

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <div className="flex shrink-0 items-center gap-1.5 border-b px-2 py-1.5">
        <BugIcon className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">{m.run_panel_title()}</span>
        {runs.run !== null && (
          <Badge size="sm" variant={stateVariant(runs.run.state)}>
            {getRunStateLabel(runs.run.state)}
          </Badge>
        )}
        {runs.breakpoints.size > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {runs.breakpoints.size === 1
              ? m.run_panel_breakpoints({ count: runs.breakpoints.size })
              : m.run_panel_breakpoints_plural({ count: runs.breakpoints.size })}
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
                    {m.run_panel_continue()}
                  </Button>
                }
              />
              <TooltipContent>{m.run_panel_resume_next_breakpoint()}</TooltipContent>
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
                    {m.run_panel_step()}
                  </Button>
                }
              />
              <TooltipContent>{m.run_panel_step_advance()}</TooltipContent>
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
                    {m.run_panel_stop()}
                  </Button>
                }
              />
              <TooltipContent>{m.run_panel_cancel_run()}</TooltipContent>
            </Tooltip>
          </>
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button size="sm" variant="default" disabled={!canRun} onClick={start}>
                  <PlayIcon />
                  {m.run_panel_run()}
                </Button>
              }
            />
            <TooltipContent>{runTooltip}</TooltipContent>
          </Tooltip>
        )}

        {paused && <PauseIcon className="size-3.5 text-warning-foreground" />}

        <div className="ml-auto flex items-center gap-1">
          <select
            aria-label={m.run_panel_run_log_level_aria()}
            value={level}
            onChange={(event) => setLevel(event.target.value as FlowRunLogLevel | "all")}
            className="h-7 rounded-md border bg-background px-1.5 text-[11px]"
          >
            <option value="all">{m.debug_level_all()}</option>
            <option value="debug">{m.debug_level_debug()}</option>
            <option value="info">{m.debug_level_info()}</option>
            <option value="warn">{m.debug_level_warn()}</option>
            <option value="error">{m.debug_level_error()}</option>
          </select>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto font-mono text-[10px]">
        {visibleLogs.length === 0 ? (
          <div className="p-3 text-muted-foreground">
            {runs.run === null ? m.run_panel_no_run() : m.run_panel_no_logs()}
          </div>
        ) : (
          visibleLogs.map((entry) => <RunLogRow key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}

function getLevelLabel(level: FlowRunLogLevel): string {
  switch (level) {
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

function RunLogRow({ entry }: { entry: FlowRunLogEntryDto }) {
  return (
    <div className="border-b px-2 py-1.5 last:border-b-0">
      <div className="flex gap-2 text-[9px] text-muted-foreground">
        <span>{entry.createdAt}</span>
        <span className={LEVEL_CLASS_NAMES[entry.level]}>{getLevelLabel(entry.level)}</span>
        {entry.nodeId !== null && (
          <span className="truncate text-fuchsia-700 dark:text-fuchsia-300" title={entry.nodeId}>
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
