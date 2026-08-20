import { ipcMain, MessageChannelMain } from "electron";

import { ELECTRON_CHANNELS } from "../../shared/electron-api";
import {
  CreateVirtualDisplayInputSchema,
  DisplayIdInputSchema,
  InjectScreenTouchInputSchema,
  PressDeviceButtonInputSchema,
  RequestScreenVideoInputSchema,
  ScrcpySettingsSchema,
  type ScrcpySettings,
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
      const settings = ScrcpySettingsSchema.parse(raw);
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
    (): Promise<ScreenOperationResult> => service.destroyVirtualDisplay(),
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
}
