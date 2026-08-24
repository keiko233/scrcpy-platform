import { ipcMain, MessageChannelMain } from "electron";

import { ELECTRON_CHANNELS } from "../../shared/electron-api";
import {
  CreateVirtualDisplayInputSchema,
  DisplayIdInputSchema,
  InjectScreenKeyboardInputSchema,
  InjectScreenTouchInputSchema,
  PressDeviceButtonInputSchema,
  RequestScreenVideoInputSchema,
  ScrcpySettingsSchema,
  type ScrcpySettings,
  type ScreenVideoCaptureResponseMessage,
  type ScreenOperationResult,
} from "../../shared/screen-contracts";
import type { ScreenSessionService } from "../adb/screen-session";

export function registerScreenHandlers(service: ScreenSessionService): void {
  ipcMain.handle(ELECTRON_CHANNELS.screensSession, () => service.getSnapshot());

  ipcMain.handle(ELECTRON_CHANNELS.screensSettingsGet, () =>
    service.getSettings(),
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.screensSettingsSet,
    (_event, raw: unknown): ScrcpySettings => {
      const settings = ScrcpySettingsSchema.parse(
        raw !== null && typeof raw === "object"
          ? { ocrCaptureSource: "scrcpy", ...raw }
          : raw,
      );
      service.setSettings(settings);
      return service.getSettings();
    },
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.screensRefresh,
    (): Promise<ScreenOperationResult> => service.refreshDisplays(),
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.screensStart,
    (_event, raw: unknown): Promise<ScreenOperationResult> => {
      const input = DisplayIdInputSchema.parse(raw);
      return service.startDisplay(input.displayId);
    },
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.screensCreateVirtual,
    (_event, raw: unknown): Promise<ScreenOperationResult> => {
      const input = CreateVirtualDisplayInputSchema.parse(raw);
      return service.createVirtualDisplay(input);
    },
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.screensDestroyVirtual,
    (_event, raw: unknown): Promise<ScreenOperationResult> => {
      const input = DisplayIdInputSchema.parse(raw);
      return service.destroyVirtualDisplay(input.displayId);
    },
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.screensPressButton,
    (_event, raw: unknown): Promise<ScreenOperationResult> => {
      const input = PressDeviceButtonInputSchema.parse(raw);
      return service.pressButton(input.button);
    },
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.screensInjectTouch,
    (_event, raw: unknown): Promise<ScreenOperationResult> => {
      const input = InjectScreenTouchInputSchema.parse(raw);
      return service.injectTouch(input);
    },
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.screensInjectKeyboard,
    (_event, raw: unknown): Promise<ScreenOperationResult> => {
      const input = InjectScreenKeyboardInputSchema.parse(raw);
      return service.injectKeyboard(input);
    },
  );

  ipcMain.on(ELECTRON_CHANNELS.screensRequestVideo, (event, raw: unknown) => {
    const parsed = RequestScreenVideoInputSchema.safeParse(raw);
    if (!parsed.success) {
      return;
    }
    const input = parsed.data;
    const { port1, port2 } = new MessageChannelMain();
    console.debug("screen video port requested", { streamId: input.streamId });
    service.attachVideoPort(input.streamId, port1);
    event.sender.postMessage(
      ELECTRON_CHANNELS.screensVideoPort,
      { streamId: input.streamId },
      [port2],
    );
  });

  ipcMain.on(
    ELECTRON_CHANNELS.screensVideoCaptureResponse,
    (_event, raw: unknown) => {
      service.handleVideoCaptureResponse(raw as ScreenVideoCaptureResponseMessage);
    },
  );
}
