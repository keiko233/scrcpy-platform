import { useCallback, useEffect, useRef, useState } from "react";

import { toastManager } from "@/components/ui/toast";
import { m } from "@/paraglide/messages.js";

import {
  useFlowRunQuery,
  useResumeFlowRun,
  useStartFlowRun,
  useStopFlowRun,
} from "@/hooks/query/use-flow-run";
import type {
  FlowRunDto,
  FlowRunLogEntryDto,
  ResumeAction,
  StartFlowRunInput,
  StartFlowRunResult,
} from "@/shared/run-contracts";

export interface FlowRunManager {
  run: FlowRunDto | null;
  busy: boolean;
  error: string | null;
  /** Nodes implicated by a start-time graph validation failure. */
  errorNodeIds: ReadonlySet<string>;
  errorScriptId: string | null;
  logs: FlowRunLogEntryDto[];
  breakpoints: ReadonlySet<string>;
  start: (input: StartFlowRunInput) => Promise<boolean>;
  stop: () => Promise<boolean>;
  resume: (action: ResumeAction) => Promise<boolean>;
  toggleBreakpoint: (nodeId: string) => void;
  clearError: () => void;
}

function describeStartFailure(result: Extract<StartFlowRunResult, { status: "error" }>): string {
  switch (result.error) {
    case "script-not-found":
      return "The selected script no longer exists.";
    case "device-not-connected":
      return "Connect an Android device before running the flow.";
    case "device-mismatch":
    case "session-mismatch":
    case "scope-mismatch":
      return "The Android device session changed. Refresh and run again.";
    case "run-busy":
      return "Another flow is already running.";
    case "invalid-flow":
      return result.issues?.[0]?.message ?? "The flow graph is not executable.";
  }
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function validationErrorNodeIds(
  input: StartFlowRunInput,
  result: Extract<StartFlowRunResult, { status: "error" }>,
): Set<string> {
  const nodeIds = new Set<string>();
  for (const issue of result.issues ?? []) {
    if (issue.nodeId !== undefined) {
      nodeIds.add(issue.nodeId);
    }
    if (issue.edgeId !== undefined) {
      const edge = input.document?.edges.find((item) => item.id === issue.edgeId);
      if (edge !== undefined) {
        nodeIds.add(edge.source);
        nodeIds.add(edge.target);
      }
    }
  }
  return nodeIds;
}

export function useFlowRun(): FlowRunManager {
  const runQuery = useFlowRunQuery();
  const startFlowRunMutation = useStartFlowRun();
  const stopFlowRunMutation = useStopFlowRun();
  const resumeFlowRunMutation = useResumeFlowRun();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [errorNodeIds, setErrorNodeIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [errorScriptId, setErrorScriptId] = useState<string | null>(null);
  const [logs, setLogs] = useState<FlowRunLogEntryDto[]>([]);
  const [breakpoints, setBreakpoints] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const run = runQuery.data ?? null;
  const runError = run !== null && run.state === "failed" ? run.error : null;
  const error = localError ?? runError;
  const notifiedRunErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (run === null || run.state !== "failed" || run.error === null) {
      return;
    }
    const errorKey = `${run.runId}:${run.error}`;
    if (notifiedRunErrorRef.current === errorKey) {
      return;
    }
    notifiedRunErrorRef.current = errorKey;
    toastManager.add({
      type: "error",
      title: m.run_error_execution_title(),
      description: run.error,
    });
  }, [run]);

  useEffect(() => {
    return window.scrcpyPlatform.onFlowRunLog((entry) => {
      setLogs((current) => [...current, entry].slice(-1000));
    });
  }, []);

  const start = useCallback(
    async (input: StartFlowRunInput) => {
      setBusy(true);
      setLocalError(null);
      setErrorNodeIds(new Set());
      setErrorScriptId(null);
      try {
        const result = await startFlowRunMutation.mutateAsync({
          ...input,
          breakpoints: [...breakpoints],
        });
        if (result.status === "error") {
          const message = describeStartFailure(result);
          setLocalError(message);
          setErrorNodeIds(validationErrorNodeIds(input, result));
          setErrorScriptId(input.scriptId);
          toastManager.add({
            type: "error",
            title: m.run_error_start_title(),
            description: message,
          });
          return false;
        }
        setLogs([]);
        return true;
      } catch (cause) {
        const message = errorMessage(cause);
        setLocalError(message);
        toastManager.add({
          type: "error",
          title: m.run_error_request_title(),
          description: message,
        });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [breakpoints, startFlowRunMutation],
  );

  const stop = useCallback(async () => {
    if (run === null) {
      return false;
    }
    setBusy(true);
    try {
      const result = await stopFlowRunMutation.mutateAsync({
        runId: run.runId,
      });
      if (result.status === "error") {
        setLocalError("The active flow run no longer exists.");
        return false;
      }
      return true;
    } catch (cause) {
      setLocalError(errorMessage(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }, [run, stopFlowRunMutation]);

  const resume = useCallback(
    async (action: ResumeAction) => {
      if (run === null) {
        return false;
      }
      setBusy(true);
      try {
        const result = await resumeFlowRunMutation.mutateAsync({
          runId: run.runId,
          action,
        });
        if (result.status === "error") {
          setLocalError(
            result.error === "run-not-found"
              ? "The active flow run no longer exists."
              : "The flow run is not paused.",
          );
          return false;
        }
        return true;
      } catch (cause) {
        setLocalError(errorMessage(cause));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [run, resumeFlowRunMutation],
  );

  const toggleBreakpoint = useCallback((nodeId: string) => {
    setBreakpoints((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const clearError = useCallback(() => {
    setLocalError(null);
    setErrorNodeIds(new Set());
    setErrorScriptId(null);
  }, []);
  return {
    run,
    busy,
    error,
    errorNodeIds,
    errorScriptId,
    logs,
    breakpoints,
    start,
    stop,
    resume,
    toggleBreakpoint,
    clearError,
  };
}
