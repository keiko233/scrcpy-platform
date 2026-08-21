import type { Adb } from "@yume-chan/adb";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  AdbDeviceDto,
  ConnectDeviceFailure,
  ConnectDeviceResult,
  DeviceSessionDto,
  DeviceSessionState,
  DisconnectDeviceResult,
  InstalledAppDto,
  ListDevicesResult,
} from "../../shared/device-contracts";
import { readInstalledApp } from "./installed-app-parser";

/**
 * A device reported by the underlying ADB transport.
 * `transportId` is a decimal string to keep the shared IPC/JSON boundary
 * independent of the ADB server's BigInt representation.
 */
export type DeviceInfo = AdbDeviceDto;

/**
 * An established connection to a single device.
 * Owns the underlying ADB instance and is the only object allowed to close it.
 */
export interface DeviceConnection {
  readonly transportId: string;
  readonly serial: string;
  readonly adb: Adb;
  close(): Promise<void>;
}

export type BeforeDeviceDisconnectHook = (
  connection: DeviceConnection,
) => Promise<void>;

/**
 * Injected abstraction over the ADB transport.
 * Kept free of Electron and Tango imports so the session model is unit-testable.
 * A future registry can hold one gateway and many sessions.
 */
export interface DeviceGateway {
  listDevices(): Promise<DeviceInfo[]>;
  connectDevice(device: DeviceInfo): Promise<DeviceConnection>;
  dispose(): Promise<void>;
}

/**
 * Raised when the ADB server socket cannot be reached (server not running,
 * refused connection, protocol failure on `host:devices`, etc).
 */
export class DeviceServerUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeviceServerUnavailableError";
  }
}

interface SessionTarget {
  transportId: string;
  serial: string;
}

function randomSessionId(): string {
  return `session-${crypto.randomUUID()}`;
}

function parsePackageNames(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^package:/, ""))
    .filter((packageName) => packageName.length > 0);
}

function parsePackageRecords(
  output: string,
  userPackages: ReadonlySet<string>,
): Array<{ packageName: string; apkPath: string; system: boolean }> {
  return output
    .split(/\r?\n/)
    .map((line) => {
      const match = /^package:(.+\.apk)=([^=]+)$/.exec(line.trim());
      if (match === null) {
        return null;
      }
      return {
        apkPath: match[1],
        packageName: match[2],
        system: !userPackages.has(match[2]),
      };
    })
    .filter((record) => record !== null);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Serializes all state transitions onto a single promise queue so concurrent
 * connect/disconnect calls cannot interleave. Reads (`getSession`) are a
 * best-effort snapshot and never mutate state.
 */
export class DeviceSessionService {
  readonly sessionId: string;

  readonly #gateway: DeviceGateway;
  #state: DeviceSessionState = "disconnected";
  #target: SessionTarget | null = null;
  #connection: DeviceConnection | null = null;
  #errorMessage: string | null = null;
  #queue: Promise<void> = Promise.resolve();
  #disposePromise: Promise<void> | null = null;
  readonly #beforeDisconnectHooks = new Set<BeforeDeviceDisconnectHook>();
  readonly #userDataPath: string | null;

  constructor(
    gateway: DeviceGateway,
    sessionId: string = randomSessionId(),
    userDataPath: string | null = null,
  ) {
    this.#gateway = gateway;
    this.sessionId = sessionId;
    this.#userDataPath = userDataPath;
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.#queue.then(operation, operation);
    this.#queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  async listDevices(): Promise<ListDevicesResult> {
    try {
      const devices = await this.#gateway.listDevices();
      return { status: "ok", devices };
    } catch {
      return { status: "error", error: "server-unavailable" };
    }
  }

  getSession(): DeviceSessionDto {
    return this.#snapshot();
  }

  getConnection(): DeviceConnection | null {
    return this.#state === "connected" ? this.#connection : null;
  }

  async listInstalledApps(): Promise<InstalledAppDto[]> {
    const connection = this.getConnection();
    if (connection === null) {
      return [];
    }
    const [allOutput, userOutput] = await Promise.all([
      connection.adb.subprocess.noneProtocol.spawnWaitText([
        "pm",
        "list",
        "packages",
        "-f",
      ]),
      connection.adb.subprocess.noneProtocol.spawnWaitText([
        "pm",
        "list",
        "packages",
        "-3",
      ]),
    ]);
    const userPackages = new Set(parsePackageNames(userOutput));
    const iconDirectory = this.#userDataPath === null
      ? null
      : join(this.#userDataPath, "installed-app-icons");
    if (iconDirectory !== null) {
      await mkdir(iconDirectory, { recursive: true });
    }
    const apps = await Promise.all(
      parsePackageRecords(allOutput, userPackages).map(async (record) => {
        try {
          const apk = await connection.adb.subprocess.noneProtocol.spawnWait([
            "cat",
            shellQuote(record.apkPath),
          ]);
          if (iconDirectory === null) {
            return {
              packageName: record.packageName,
              name: record.packageName,
              iconUrl: null,
              system: record.system,
            } satisfies InstalledAppDto;
          }
          return await readInstalledApp(record, apk, iconDirectory);
        } catch {
          return {
            packageName: record.packageName,
            name: record.packageName,
            iconUrl: null,
            system: record.system,
          } satisfies InstalledAppDto;
        }
      }),
    );
    return apps.sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
    );
  }

  registerBeforeDisconnect(hook: BeforeDeviceDisconnectHook): () => void {
    this.#beforeDisconnectHooks.add(hook);
    return () => this.#beforeDisconnectHooks.delete(hook);
  }

  connectDevice(transportId: string): Promise<ConnectDeviceResult> {
    return this.#enqueue(() => this.#connectLocked(transportId));
  }

  disconnectDevice(): Promise<DisconnectDeviceResult> {
    return this.#enqueue(() => this.#disconnectLocked());
  }

  /**
   * Attempts to tear down the active connection (if any) and releases the
   * gateway. Bounded by `timeoutMs` so application shutdown never hangs on an
   * unresponsive ADB server. Safe to call more than once.
   */
  dispose(timeoutMs = 4000): Promise<void> {
    this.#disposePromise ??= this.#disposeOnce(timeoutMs);
    return this.#disposePromise;
  }

  async #disposeOnce(timeoutMs: number): Promise<void> {
    const cleanup = this.#enqueue(() => this.#disconnectLocked()).then(() =>
      this.#gateway.dispose(),
    );
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        cleanup,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, timeoutMs);
          timer.unref();
        }),
      ]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  async #connectLocked(transportId: string): Promise<ConnectDeviceResult> {
    const target = this.#target;
    if (
      target !== null &&
      target.transportId === transportId &&
      this.#state === "connected"
    ) {
      return { status: "ok", session: this.#snapshot() };
    }

    if (
      this.#state === "connected" ||
      this.#state === "connecting" ||
      this.#state === "disconnecting"
    ) {
      return { status: "error", error: "session-busy" };
    }

    this.#state = "connecting";
    this.#target = { transportId, serial: "" };
    this.#errorMessage = null;

    try {
      const devices = await this.#gateway.listDevices();
      const device = devices.find((item) => item.transportId === transportId);
      if (device === undefined) {
        this.#fail(`No device with transportId ${transportId}`);
        return { status: "error", error: "device-missing" };
      }
      if (device.state !== "device") {
        this.#fail(
          `Device ${device.serial} is not ready (state: ${device.state})`,
        );
        return { status: "error", error: "device-not-ready" };
      }

      const connection = await this.#gateway.connectDevice(device);
      this.#connection = connection;
      this.#target = { transportId, serial: device.serial };
      this.#state = "connected";
      this.#errorMessage = null;
      return { status: "ok", session: this.#snapshot() };
    } catch (error) {
      this.#fail(errorMessageOf(error));
      return {
        status: "error",
        error: this.#classifyConnectError(error),
      };
    }
  }

  async #disconnectLocked(): Promise<DisconnectDeviceResult> {
    if (this.#state === "disconnected") {
      return { status: "ok", session: this.#snapshot() };
    }

    const connection = this.#connection;
    this.#state = "disconnecting";
    this.#errorMessage = null;
    if (connection !== null) {
      this.#connection = null;
      try {
        await Promise.allSettled(
          [...this.#beforeDisconnectHooks].map((hook) => hook(connection)),
        );
        await connection.close();
      } catch (error) {
        this.#target = null;
        this.#state = "disconnected";
        this.#errorMessage = errorMessageOf(error);
        return { status: "error", error: "disconnect-failed" };
      }
    }
    this.#target = null;
    this.#state = "disconnected";
    return { status: "ok", session: this.#snapshot() };
  }

  #fail(message: string): void {
    this.#state = "error";
    this.#errorMessage = message;
  }

  #classifyConnectError(error: unknown): ConnectDeviceFailure {
    if (error instanceof DeviceServerUnavailableError) {
      return "server-unavailable";
    }
    return "connection-failed";
  }

  #snapshot(): DeviceSessionDto {
    return {
      sessionId: this.sessionId,
      transportId: this.#target?.transportId ?? null,
      serial: this.#target?.serial ?? null,
      state: this.#state,
      errorMessage: this.#errorMessage,
    };
  }
}
