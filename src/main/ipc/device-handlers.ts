import { ipcMain } from "electron";
import { ELECTRON_CHANNELS } from "../../shared/electron-api";
import {
  ConnectDeviceInputSchema,
  type ConnectDeviceResult,
  type DisconnectDeviceResult,
  type ListDevicesResult,
} from "../../shared/device-contracts";
import type { DeviceSessionService } from "../adb/device-session";

export function registerDeviceHandlers(service: DeviceSessionService): void {
  ipcMain.handle(
    ELECTRON_CHANNELS.devicesList,
    (): Promise<ListDevicesResult> => service.listDevices(),
  );

  ipcMain.handle(ELECTRON_CHANNELS.devicesSession, () => service.getSession());

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
}
