import { ipcMain } from "electron";
import { ELECTRON_CHANNELS } from "../../shared/electron-api";
import {
  ConnectDeviceInputSchema,
  type ConnectDeviceResult,
  type DisconnectDeviceResult,
  EnrichInstalledAppsInputSchema,
  type InstalledAppDto,
  type InstalledAppsSnapshot,
  type ListDevicesResult,
  WirelessConnectInputSchema,
  type WirelessOperationResult,
  WirelessPairInputSchema,
} from "../../shared/device-contracts";
import type { DeviceSessionService } from "../adb/device-session";

export function registerDeviceHandlers(service: DeviceSessionService): void {
  ipcMain.handle(
    ELECTRON_CHANNELS.devicesList,
    (): Promise<ListDevicesResult> => service.listDevices(),
  );

  ipcMain.handle(ELECTRON_CHANNELS.devicesSession, () => service.getSession());

  ipcMain.handle(
    ELECTRON_CHANNELS.devicesPackages,
    (): Promise<InstalledAppsSnapshot> => service.listInstalledApps(),
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.devicesPackagesEnrich,
    (_event, raw: unknown): Promise<InstalledAppDto[]> => {
      const input = EnrichInstalledAppsInputSchema.parse(raw);
      return service.enrichInstalledApps(input.packages);
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
    (): Promise<DisconnectDeviceResult> => service.disconnectDevice(),
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
    (_event, raw: unknown): Promise<WirelessOperationResult> => {
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
}
