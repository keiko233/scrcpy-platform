import { BrowserWindow, ipcMain } from "electron";
import { ELECTRON_CHANNELS } from "../../shared/electron-api";
import {
  ConnectDeviceInputSchema,
  DisconnectDeviceInputSchema,
  type ConnectDeviceResult,
  type DisconnectDeviceResult,
  EnrichInstalledAppsInputSchema,
  type InstalledAppDto,
  type InstalledAppsSnapshot,
  type ListDevicesResult,
  WirelessConnectInputSchema,
  type WirelessConnectResult,
  type WirelessOperationResult,
  WirelessPairInputSchema,
} from "../../shared/device-contracts";
import { WindowContextRegistry } from "../windows/window-context-registry";
import type { DeviceRegistryService } from "../devices/device-registry";

export function registerDeviceHandlers(
  service: DeviceRegistryService,
  contexts: WindowContextRegistry,
): () => void {
  ipcMain.handle(
    ELECTRON_CHANNELS.devicesList,
    (): Promise<ListDevicesResult> => service.listDevices(),
  );

  ipcMain.handle(ELECTRON_CHANNELS.devicesSessions, () => service.listSessions());

  ipcMain.handle(ELECTRON_CHANNELS.devicesSession, (event, raw: unknown) => {
    const input = raw === undefined ? {} : raw;
    const sessionId =
      input !== null && typeof input === "object" && "sessionId" in input
        ? DisconnectDeviceInputSchema.parse(input).sessionId
        : undefined;
    const screen = contexts.getScreen(event.sender.id);
    return service.getSession(screen?.target.sessionId ?? sessionId);
  });

  ipcMain.handle(
    ELECTRON_CHANNELS.devicesPackages,
    (event): Promise<InstalledAppsSnapshot> => {
      const screen = contexts.getScreen(event.sender.id);
      return service.listInstalledApps(screen?.target.sessionId);
    },
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.devicesPackagesEnrich,
    (event, raw: unknown): Promise<InstalledAppDto[]> => {
      const input = EnrichInstalledAppsInputSchema.parse(raw);
      const screen = contexts.getScreen(event.sender.id);
      return service.enrichInstalledApps(input.packages, screen?.target.sessionId);
    },
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.devicesConnect,
    (_event, raw: unknown): Promise<ConnectDeviceResult> => {
      const input = ConnectDeviceInputSchema.parse(raw);
      return service.connectDevice(input.transportId);
    },
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.devicesDisconnect,
    (_event, raw: unknown): Promise<DisconnectDeviceResult> => {
      const input = DisconnectDeviceInputSchema.parse(raw ?? {});
      return service.disconnectDevice(input.sessionId);
    },
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.devicesWirelessPair,
    (_event, raw: unknown): Promise<WirelessOperationResult> => {
      const input = WirelessPairInputSchema.parse(raw);
      return service.pairWirelessDevice(input);
    },
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.devicesWirelessConnect,
    (_event, raw: unknown): Promise<WirelessConnectResult> => {
      const input = WirelessConnectInputSchema.parse(raw);
      return service.connectWirelessDevice(input);
    },
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.devicesWirelessDisconnect,
    (_event, raw: unknown): Promise<WirelessOperationResult> => {
      const input = WirelessConnectInputSchema.parse(raw);
      return service.disconnectWirelessDevice(input);
    },
  );

  return service.subscribe((session) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        const context = contexts.get(window.webContents.id);
        if (
          context === null ||
          context.kind === "manager" ||
          context.kind === "pair" ||
          (context.kind === "screen" &&
            context.target.sessionId === session.sessionId)
        ) {
          window.webContents.send(ELECTRON_CHANNELS.devicesSessionChanged, session);
        }
      }
    }
  });
}
