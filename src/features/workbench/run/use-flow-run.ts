import { useCallback, useEffect, useState } from "react";

import type {
  FlowRunDto,
  StartFlowRunInput,
  StartFlowRunResult,
} from "@/shared/run-contracts";

export interface FlowRunManager {
  run: FlowRunDto | null;
  busy: boolean;
  error: string | null;
  start: (input: StartFlowRunInput) => Promise<boolean>;
  stop: () => Promise<boolean>;
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
      return "The Android device session changed. Refresh and run again.";
    case "run-busy":
      return "Another flow is already running.";
    case "invalid-flow":
      return result.issues?.[0]?.message ?? "The flow graph is not executable.";
  }
}

export function useFlowRun(): FlowRunManager {
  const [run, setRun] = useState<FlowRunDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    const unsubscribe = window.androidPlatform.onFlowRun((next) => {
      if (!disposed) {
        setRun(next);
        setError(next.state === "failed" ? next.error : null);
      }
    });
    void window.androidPlatform
      .getFlowRun()
      .then((current) => {
        if (!disposed) {
          setRun(current);
          setError(current?.state === "failed" ? current.error : null);
        }
      })
      .catch((cause) => {
        if (!disposed) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  const start = useCallback(async (input: StartFlowRunInput) => {
    setBusy(true);
    setError(null);
    try {
      const result = await window.androidPlatform.startFlowRun(input);
      if (result.status === "error") {
        setError(describeStartFailure(result));
        return false;
      }
      setRun(result.run);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const stop = useCallback(async () => {
    if (run === null) {
      return false;
    }
    setBusy(true);
    try {
      const result = await window.androidPlatform.stopFlowRun({ runId: run.runId });
      if (result.status === "error") {
        setError("The active flow run no longer exists.");
        return false;
      }
      setRun(result.run);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }, [run]);

  const clearError = useCallback(() => setError(null), []);
  return { run, busy, error, start, stop, clearError };
}
