import { z } from "zod";
import { BrowserWindow, ipcMain, MessageChannelMain } from "electron";

import { ELECTRON_CHANNELS } from "../../shared/electron-api";
import {
  CreateVirtualDisplayInputSchema,
  DisplayIdInputSchema,
  InjectScreenKeyboardInputSchema,
  InjectScreenTouchInputSchema,
  PressDeviceButtonInputSchema,
  RequestScreenVideoInputSchema,
  ScrcpyOverridableScopeSchema,
  ScrcpyOverridesSchema,
  ScrcpySettingsSchema,
  ScrcpySettingsScopeSchema,
  type ScreenOperationResult,
  type ScreenSessionDto,
  type ScreenVideoCaptureResponseMessage,
  type ScrcpyConfiguredScope,
  type ScrcpySettingsScopeView,
} from "../../shared/screen-contracts";
import {
  CreateVirtualScreenForDeviceInputSchema,
  ListScreenDisplaysInputSchema,
  OpenScreenInputSchema,
} from "../../shared/window-contracts";
import type { DeviceRegistryService } from "../devices/device-registry";
import type { ScreenRegistryService } from "../screens/screen-registry";
import type { WindowManager } from "../windows/window-manager";
import { WindowContextRegistry } from "../windows/window-context-registry";

function errorResult(
  code: Extract<ScreenOperationResult, { status: "error" }>['error']['code'],
  message: string,
): ScreenOperationResult {
  return { status: "error", error: { code, message } };
}

function emptyScreen(): ScreenSessionDto {
  return {
    sessionId: "no-screen-session",
    serial: null,
    state: "disconnected",
    displays: [],
    activeDisplayId: null,
    ownedVirtualDisplayIds: [],
    streamId: null,
    videoCodec: null,
    videoWidth: 0,
    videoHeight: 0,
    errorMessage: null,
  };
}

const ScrcpyScopeOverridesInputSchema = z
  .object({
    scope: ScrcpyOverridableScopeSchema,
    overrides: ScrcpyOverridesSchema,
  })
  .strict();

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerScreenHandlers(
  screens: ScreenRegistryService,
  devices: DeviceRegistryService,
  contexts: WindowContextRegistry,
  windows: WindowManager,
): () => void {
  const getScreenContext = (senderId: number) => contexts.getScreen(senderId);

  ipcMain.handle(ELECTRON_CHANNELS.screensSession, (event): ScreenSessionDto => {
    const context = getScreenContext(event.sender.id);
    return context === null
      ? emptyScreen()
      : screens.getContext(context.target.screenInstanceId)?.screen ?? emptyScreen();
  });

  ipcMain.handle(ELECTRON_CHANNELS.screensDisplays, (_event, raw: unknown) => {
    const input = ListScreenDisplaysInputSchema.parse(raw);
    return screens.listDisplays(input.sessionId);
  });

  ipcMain.handle(
    ELECTRON_CHANNELS.screensSettingsGet,
    (_event, raw: unknown): ScrcpySettingsScopeView => {
      const scope = ScrcpySettingsScopeSchema.parse(raw);
      return screens.getScopeView(scope);
    },
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.screensSettingsGlobalSet,
    (_event, raw: unknown): ScrcpySettingsScopeView => {
      const settings = ScrcpySettingsSchema.parse(raw);
      return screens.setGlobalSettings(settings);
    },
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.screensSettingsOverridesSet,
    (_event, raw: unknown): ScrcpySettingsScopeView => {
      const input = ScrcpyScopeOverridesInputSchema.parse(raw);
      const { scope, overrides } = input;
      return scope.scope === "device"
        ? screens.setDeviceOverrides(scope.deviceKey, overrides)
        : screens.setScreenOverrides(scope.deviceKey, scope.displayId, overrides);
    },
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.screensSettingsDelete,
    (_event, raw: unknown): void => {
      const scope = ScrcpyOverridableScopeSchema.parse(raw);
      screens.deleteScope(scope);
    },
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.screensSettingsScopes,
    (): ScrcpyConfiguredScope[] => screens.listConfiguredScopes(),
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.screensRefresh,
    (event): Promise<ScreenOperationResult> => {
      const context = getScreenContext(event.sender.id);
      return context === null
        ? Promise.resolve(errorResult("scope-mismatch", "Display refresh is only available in a screen window."))
        : screens.refresh(context.target);
    },
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.screensStart,
    (event, raw: unknown): Promise<ScreenOperationResult> => {
      const input = DisplayIdInputSchema.parse(raw);
      const context = getScreenContext(event.sender.id);
      if (context === null) {
        return Promise.resolve(errorResult("scope-mismatch", "A screen window is required to start a display stream."));
      }
      if (input.displayId !== context.target.displayId) {
        return Promise.resolve(errorResult("scope-mismatch", "The requested display is outside this screen window."));
      }
      return screens.start(context.target);
    },
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.screensOpenWindow,
    async (_event, raw: unknown) => {
      const input = OpenScreenInputSchema.parse(raw);
      const opened = await screens.openScreen(input);
      if (opened.status === "error") {
        return opened;
      }
      try {
        windows.openScreen(opened.ref);
      } catch (error) {
        await screens.close(opened.ref.screenInstanceId, true);
        return {
          status: "error",
          message: `The screen window could not be opened: ${messageOf(error)}`,
        };
      }
      return { status: "ok", ref: opened.ref, reused: opened.reused };
    },
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.screensCreateVirtualForDevice,
    async (_event, raw: unknown): Promise<ScreenOperationResult> => {
      const input = CreateVirtualScreenForDeviceInputSchema.parse(raw);
      const result = await screens.createVirtualDisplay(input.sessionId, input);
      if (result.status === "ok") {
        const displayId = result.screen.activeDisplayId;
        if (displayId !== null) {
          const context = screens.getContextForDisplay(input.sessionId, displayId);
          if (context !== null) {
            try {
              windows.openScreen(context.ref);
            } catch (error) {
              await screens.close(context.ref.screenInstanceId, true);
              return errorResult(
                "operation-failed",
                `The screen window could not be opened: ${messageOf(error)}`,
              );
            }
          }
        }
      }
      return result;
    },
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.screensCreateVirtual,
    async (_event, raw: unknown): Promise<ScreenOperationResult> => {
      const input = CreateVirtualDisplayInputSchema.parse(raw);
      const primary = devices.getSession();
      if (primary.state !== "connected") {
        return errorResult("not-connected", "Connect an Android device first.");
      }
      return screens.createVirtualDisplay(primary.sessionId, input);
    },
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.screensDestroyVirtual,
    async (event, raw: unknown): Promise<ScreenOperationResult> => {
      const input = DisplayIdInputSchema.parse(raw);
      const context = getScreenContext(event.sender.id);
      const sessionId =
        context?.target.sessionId ?? input.sessionId ?? devices.getSession().sessionId;
      if (context !== null && input.displayId !== context.target.displayId) {
        return errorResult("scope-mismatch", "The requested display is outside this screen window.");
      }
      return screens.destroyVirtualDisplay(sessionId, input.displayId);
    },
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.screensPressButton,
    (event, raw: unknown): Promise<ScreenOperationResult> => {
      const input = PressDeviceButtonInputSchema.parse(raw);
      const context = getScreenContext(event.sender.id);
      const target = context === null ? null : screens.getContextByRef(context.target);
      return target === null
        ? Promise.resolve(errorResult("scope-mismatch", "A screen window is required to control a display."))
        : target.service.pressButton(input.button);
    },
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.screensInjectTouch,
    (event, raw: unknown): Promise<ScreenOperationResult> => {
      const input = InjectScreenTouchInputSchema.parse(raw);
      const context = getScreenContext(event.sender.id);
      if (context === null || input.displayId !== context.target.displayId) {
        return Promise.resolve(errorResult("scope-mismatch", "The requested display is outside this screen window."));
      }
      const target = screens.getContextByRef(context.target);
      return target === null
        ? Promise.resolve(errorResult("screen-stale", "The screen window target is stale."))
        : target.service.injectTouch(input);
    },
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.screensInjectKeyboard,
    (event, raw: unknown): Promise<ScreenOperationResult> => {
      const input = InjectScreenKeyboardInputSchema.parse(raw);
      const context = getScreenContext(event.sender.id);
      if (context === null || input.displayId !== context.target.displayId) {
        return Promise.resolve(errorResult("scope-mismatch", "The requested display is outside this screen window."));
      }
      const target = screens.getContextByRef(context.target);
      return target === null
        ? Promise.resolve(errorResult("screen-stale", "The screen window target is stale."))
        : target.service.injectKeyboard(input);
    },
  );

  ipcMain.on(ELECTRON_CHANNELS.screensRequestVideo, (event, raw: unknown) => {
    const parsed = RequestScreenVideoInputSchema.safeParse(raw);
    const context = getScreenContext(event.sender.id);
    if (!parsed.success || context === null) {
      return;
    }
    const { port1, port2 } = new MessageChannelMain();
    console.debug("screen video port requested", {
      streamId: parsed.data.streamId,
      screenInstanceId: context.target.screenInstanceId,
    });
    if (!screens.attachVideoPort(context.target, parsed.data.streamId, port1)) {
      port2.close();
      return;
    }
    event.sender.postMessage(
      ELECTRON_CHANNELS.screensVideoPort,
      { streamId: parsed.data.streamId },
      [port2],
    );
  });

  ipcMain.on(
    ELECTRON_CHANNELS.screensVideoCaptureResponse,
    (event, raw: unknown) => {
      const context = getScreenContext(event.sender.id);
      if (context !== null) {
        screens.handleVideoCaptureResponse(context.target, raw as ScreenVideoCaptureResponseMessage);
      }
    },
  );

  return screens.subscribe(({ ref, screen }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed() || window.webContents.isDestroyed()) {
        continue;
      }
      const context = contexts.getScreen(window.webContents.id);
      if (context?.target.screenInstanceId === ref.screenInstanceId) {
        window.webContents.send(ELECTRON_CHANNELS.screensSessionChanged, screen);
      }
    }
  });
}
