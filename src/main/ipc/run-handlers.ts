import { BrowserWindow, ipcMain } from "electron";

import { ELECTRON_CHANNELS } from "../../shared/electron-api";
import {
  StartFlowRunInputSchema,
  StopFlowRunInputSchema,
  type StartFlowRunResult,
  type StopFlowRunResult,
} from "../../shared/run-contracts";
import type { FlowRuntimeService } from "../runtime/flow-runtime";

export function registerRunHandlers(service: FlowRuntimeService): () => void {
  ipcMain.handle(ELECTRON_CHANNELS.runsGet, () => service.getRun());
  ipcMain.handle(
    ELECTRON_CHANNELS.runsStart,
    (_event, raw: unknown): StartFlowRunResult => {
      const input = StartFlowRunInputSchema.parse(raw);
      return service.start(input);
    },
  );
  ipcMain.handle(
    ELECTRON_CHANNELS.runsStop,
    (_event, raw: unknown): Promise<StopFlowRunResult> => {
      const input = StopFlowRunInputSchema.parse(raw);
      return service.stop(input);
    },
  );

  return service.subscribe((run) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(ELECTRON_CHANNELS.runsEvent, run);
      }
    }
  });
}
