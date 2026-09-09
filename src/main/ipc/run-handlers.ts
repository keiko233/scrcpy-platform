import { BrowserWindow, ipcMain } from "electron";

import { ELECTRON_CHANNELS } from "../../shared/electron-api";
import {
  ResumeFlowRunInputSchema,
  StartFlowRunInputSchema,
  StopFlowRunInputSchema,
  type FlowRunDto,
  type ResumeFlowRunResult,
  type StartFlowRunResult,
  type StopFlowRunResult,
} from "../../shared/run-contracts";
import type { DeviceRegistryService } from "../devices/device-registry";
import type { RunRegistry } from "../runtime/run-registry";
import { WindowContextRegistry } from "../windows/window-context-registry";

function scopeFailure(): StartFlowRunResult {
  return { status: "error", error: "scope-mismatch" };
}

function findRuntimeForSender(
  senderId: number,
  contexts: WindowContextRegistry,
  runs: RunRegistry,
): { screenInstanceId: string; sessionId: string; displayId: number } | null {
  const context = contexts.getScreen(senderId);
  if (context === null) {
    return null;
  }
  const ref = runs.getRef(context.target.screenInstanceId);
  return ref === null
    ? null
    : {
        screenInstanceId: ref.screenInstanceId,
        sessionId: ref.sessionId,
        displayId: ref.displayId,
      };
}

export function registerRunHandlers(
  runs: RunRegistry,
  devices: DeviceRegistryService,
  contexts: WindowContextRegistry,
): () => void {
  ipcMain.handle(ELECTRON_CHANNELS.runsGet, (event): FlowRunDto | null => {
    const screen = findRuntimeForSender(event.sender.id, contexts, runs);
    if (screen !== null) {
      return runs.getRun(screen.screenInstanceId);
    }
    for (const context of contexts.all()) {
      if (context.kind === "screen") {
        const run = runs.getRun(context.target.screenInstanceId);
        if (run !== null && (run.state === "running" || run.state === "paused")) {
          return run;
        }
      }
    }
    return null;
  });

  ipcMain.handle(
    ELECTRON_CHANNELS.runsStart,
    (event, raw: unknown): StartFlowRunResult => {
      const input = StartFlowRunInputSchema.parse(raw);
      const target = findRuntimeForSender(event.sender.id, contexts, runs);
      if (target === null) {
        return scopeFailure();
      }
      if (
        input.sessionId !== target.sessionId ||
        input.displayId !== target.displayId
      ) {
        return scopeFailure();
      }
      const session = devices.getSessionService(target.sessionId);
      if (session === null) {
        return { status: "error", error: "device-not-connected" };
      }
      const connection = session.getConnection();
      if (connection === null) {
        return { status: "error", error: "device-not-connected" };
      }
      return runs.start(target.screenInstanceId, {
        ...input,
        deviceId: connection.transportId,
        sessionId: target.sessionId,
        displayId: target.displayId,
      });
    },
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.runsStop,
    (event, raw: unknown): Promise<StopFlowRunResult> => {
      const input = StopFlowRunInputSchema.parse(raw);
      const screen = findRuntimeForSender(event.sender.id, contexts, runs);
      const found = screen === null ? runs.findByRunId(input.runId) : {
        screenInstanceId: screen.screenInstanceId,
        runtime: runs.getRuntime(screen.screenInstanceId),
      };
      if (found === null || found.runtime === null) {
        return Promise.resolve({ status: "error", error: "run-not-found" });
      }
      if (screen !== null && found.runtime.getRun()?.runId !== input.runId) {
        return Promise.resolve({ status: "error", error: "run-not-found" });
      }
      return runs.stop(found.screenInstanceId, input);
    },
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.runsResume,
    (event, raw: unknown): ResumeFlowRunResult => {
      const input = ResumeFlowRunInputSchema.parse(raw);
      const screen = findRuntimeForSender(event.sender.id, contexts, runs);
      const found = screen === null ? runs.findByRunId(input.runId) : {
        screenInstanceId: screen.screenInstanceId,
        runtime: runs.getRuntime(screen.screenInstanceId),
      };
      if (found === null || found.runtime === null) {
        return { status: "error", error: "run-not-found" };
      }
      if (screen !== null && found.runtime.getRun()?.runId !== input.runId) {
        return { status: "error", error: "run-not-found" };
      }
      return runs.resume(found.screenInstanceId, input);
    },
  );

  const removeRunListener = runs.subscribe((screenInstanceId, run) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed()) {
        continue;
      }
      const context = contexts.get(window.webContents.id);
      if (
        context?.kind === "manager" ||
        (context?.kind === "screen" &&
          context.target.screenInstanceId === screenInstanceId)
      ) {
        window.webContents.send(ELECTRON_CHANNELS.runsEvent, run);
      }
    }
  });
  const removeLogListener = runs.subscribeLogs((screenInstanceId, entry) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed()) {
        continue;
      }
      const context = contexts.get(window.webContents.id);
      if (
        context?.kind === "manager" ||
        (context?.kind === "screen" &&
          context.target.screenInstanceId === screenInstanceId)
      ) {
        window.webContents.send(ELECTRON_CHANNELS.runsLogEvent, entry);
      }
    }
  });

  return () => {
    removeRunListener();
    removeLogListener();
  };
}
