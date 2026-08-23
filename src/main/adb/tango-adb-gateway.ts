import { AdbServerClient } from "@yume-chan/adb";
import type { Adb } from "@yume-chan/adb";
import { AdbServerNodeTcpConnector } from "@yume-chan/adb-server-node-tcp";
import type { SocketConnectOpts } from "node:net";
import type {
  AdbDeviceDto,
  WirelessConnectInput,
  WirelessPairInput,
} from "../../shared/device-contracts";
import { AdbConstants } from "../../shared/constants/app";
import {
  DeviceServerUnavailableError,
  WirelessGatewayError,
  type DeviceConnection,
  type DeviceGateway,
  type DeviceInfo,
} from "./device-session";

export const ADB_SERVER_DEFAULT_HOST = AdbConstants.DEFAULT_HOST;
export const ADB_SERVER_DEFAULT_PORT = AdbConstants.DEFAULT_PORT;

/**
 * Maps an `AdbServerClient.Device` to a structured-cloneable DTO.
 * BigInt transport ids are serialized as decimal strings so shared IPC/JSON
 * contracts don't depend on a runtime-specific numeric representation.
 */
export function mapAdbServerDevice(
  device: AdbServerClient.Device,
): AdbDeviceDto {
  const dto: AdbDeviceDto = {
    transportId: device.transportId.toString(10),
    serial: device.serial,
    state: device.state,
  };
  if (device.product !== undefined) {
    dto.product = device.product;
  }
  if (device.model !== undefined) {
    dto.model = device.model;
  }
  if (device.device !== undefined) {
    dto.device = device.device;
  }
  return dto;
}

/**
 * Resolves the ADB server socket the same way the official connector documents:
 * `ADB_SERVER_SOCKET` wins, otherwise `ANDROID_ADB_SERVER_ADDRESS` /
 * `ANDROID_ADB_SERVER_PORT`, defaulting to `localhost:5037`.
 */
export function resolveAdbServerSocketSpec(
  env: NodeJS.ProcessEnv = process.env,
): SocketConnectOpts {
  const explicit = env.ADB_SERVER_SOCKET;
  if (explicit !== undefined && explicit !== "") {
    const parsed = parseAdbSocketSpec(explicit);
    if (parsed !== null) {
      return parsed;
    }
  }
  const host = env.ANDROID_ADB_SERVER_ADDRESS || ADB_SERVER_DEFAULT_HOST;
  const port = parsePort(env.ANDROID_ADB_SERVER_PORT);
  return { host, port };
}

function parsePort(value: string | undefined): number {
  if (value === undefined) {
    return ADB_SERVER_DEFAULT_PORT;
  }
  const port = Number.parseInt(value, 10);
  if (Number.isNaN(port) || port <= 0 || port > 65535) {
    return ADB_SERVER_DEFAULT_PORT;
  }
  return port;
}

function parseAdbSocketSpec(spec: string): SocketConnectOpts | null {
  const tcp = /^tcp:(.+)$/.exec(spec);
  if (tcp !== null) {
    const [host, rawPort] = tcp[1].split(":");
    if (rawPort !== undefined) {
      return { host, port: parsePort(rawPort) };
    }
    if (/^[0-9]+$/.test(host)) {
      return { host: ADB_SERVER_DEFAULT_HOST, port: parsePort(host) };
    }
    return { host, port: ADB_SERVER_DEFAULT_PORT };
  }
  const local =
    /^localfilesystem:(.+)$/.exec(spec) ?? /^local:(.+)$/.exec(spec);
  if (local !== null) {
    return { path: local[1] };
  }
  return null;
}

/**
 * `DeviceConnection` that owns the `Adb` instance created through the ADB
 * server transport. The instance is retained only here (in the Electron main
 * process) and closed exactly when `close()` is called.
 */
class TangoDeviceConnection implements DeviceConnection {
  readonly transportId: string;
  readonly serial: string;
  readonly adb: Adb;

  constructor(adb: Adb, transportId: string, serial: string) {
    this.adb = adb;
    this.transportId = transportId;
    this.serial = serial;
  }

  async close(): Promise<void> {
    await this.adb.close();
  }
}

function isAdbServerUnavailable(error: unknown): boolean {
  if (error instanceof DeviceServerUnavailableError) {
    return true;
  }
  if (error instanceof Error && "code" in error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (
      (AdbConstants.UNAVAILABLE_CODES as readonly string[]).includes(code as string)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * `DeviceGateway` backed by Google ADB's server transport.
 * Talks to an already-running local ADB server; never spawns or downloads adb
 * and never uses WebUSB.
 */
export class TangoAdbGateway implements DeviceGateway {
  readonly #client: AdbServerClient;

  constructor(spec: SocketConnectOpts = resolveAdbServerSocketSpec()) {
    this.#client = new AdbServerClient(new AdbServerNodeTcpConnector(spec));
  }

  async listDevices(): Promise<DeviceInfo[]> {
    try {
      const devices = await this.#client.getDevices([
        "unauthorized",
        "offline",
        "device",
      ]);
      const mapped = devices.map(mapAdbServerDevice);
      const transportsBySerial = new Map<string, string[]>();
      for (const device of mapped) {
        const transports = transportsBySerial.get(device.serial) ?? [];
        transports.push(device.transportId);
        transportsBySerial.set(device.serial, transports);
      }
      for (const [serial, transportIds] of transportsBySerial) {
        if (serial.length > 0 && transportIds.length > 1) {
          console.debug("multiple ADB transports reported for one device", {
            serial,
            transportIds,
          });
        }
      }
      return mapped;
    } catch (error) {
      throw new DeviceServerUnavailableError(
        `ADB server unreachable: ${errorMessageOf(error)}`,
      );
    }
  }

  async connectDevice(device: DeviceInfo): Promise<DeviceConnection> {
    try {
      const adb = await this.#client.createAdb({
        transportId: BigInt(device.transportId),
      });
      return new TangoDeviceConnection(adb, device.transportId, device.serial);
    } catch (error) {
      if (isAdbServerUnavailable(error)) {
        throw new DeviceServerUnavailableError(
          `ADB server unreachable: ${errorMessageOf(error)}`,
        );
      }
      throw error;
    }
  }

  async pairWirelessDevice({ address, password }: WirelessPairInput): Promise<void> {
    try {
      await this.#client.wireless.pair(address, password);
    } catch (error) {
      throw mapWirelessError(error);
    }
  }

  async connectWirelessDevice({ address }: WirelessConnectInput): Promise<void> {
    try {
      await this.#client.wireless.connect(address);
    } catch (error) {
      if (error instanceof AdbServerClient.AlreadyConnectedError) {
        return;
      }
      throw mapWirelessError(error);
    }
  }

  async disconnectWirelessDevice({ address }: WirelessConnectInput): Promise<void> {
    try {
      await this.#client.wireless.disconnect(address);
    } catch (error) {
      throw mapWirelessError(error);
    }
  }

  async dispose(): Promise<void> {
    // The client and connector hold no resources that survive the connections
    // created for each device; active connections are closed by the session.
  }
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function mapWirelessError(error: unknown): WirelessGatewayError {
  if (error instanceof WirelessGatewayError) {
    return error;
  }
  if (error instanceof DeviceServerUnavailableError || isAdbServerUnavailable(error)) {
    return new WirelessGatewayError("server-unavailable", errorMessageOf(error));
  }
  if (error instanceof AdbServerClient.UnauthorizedError) {
    return new WirelessGatewayError("unauthorized", errorMessageOf(error));
  }
  if (error instanceof AdbServerClient.AlreadyConnectedError) {
    return new WirelessGatewayError("already-connected", errorMessageOf(error));
  }
  if (error instanceof AdbServerClient.NetworkError) {
    return new WirelessGatewayError("network-error", errorMessageOf(error));
  }
  return new WirelessGatewayError("operation-failed", errorMessageOf(error));
}
