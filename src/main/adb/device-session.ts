import type { Adb } from "@yume-chan/adb";
import type {
  AdbDeviceDto,
  ConnectDeviceFailure,
  ConnectDeviceResult,
  DeviceSessionDto,
  DeviceSessionState,
  DisconnectDeviceResult,
  InstalledAppDto,
  InstalledAppsSnapshot,
  ListDevicesResult,
  WirelessConnectInput,
  WirelessOperationResult,
  WirelessPairInput,
} from "../../shared/device-contracts";
import { Timing } from "../../shared/constants/timing";
import { AppMetadataCacheStore } from "./app-cache";
import {
  readInstalledApp,
  type PackageRecord,
} from "./installed-app-parser";

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
  pairWirelessDevice(input: WirelessPairInput): Promise<void>;
  connectWirelessDevice(input: WirelessConnectInput): Promise<void>;
  disconnectWirelessDevice(input: WirelessConnectInput): Promise<void>;
  dispose(): Promise<void>;
}

export type WirelessGatewayErrorCode =
  | "server-unavailable"
  | "unauthorized"
  | "already-connected"
  | "network-error"
  | "operation-failed";

export class WirelessGatewayError extends Error {
  readonly code: WirelessGatewayErrorCode;

  constructor(code: WirelessGatewayErrorCode, message: string) {
    super(message);
    this.name = "WirelessGatewayError";
    this.code = code;
  }
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
): PackageRecord[] {
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

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isCacheStale(cachedAt: number): boolean {
  return Date.now() - cachedAt > Timing.INSTALLED_APPS_CACHE_TTL_MS;
}

async function runPool<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await worker(item);
    }
  });
  await Promise.all(runners);
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
  readonly #appCache: AppMetadataCacheStore | null;
  #packageRecords: Map<string, PackageRecord> | null = null;

  constructor(
    gateway: DeviceGateway,
    sessionId: string = randomSessionId(),
    userDataPath: string | null = null,
  ) {
    this.#gateway = gateway;
    this.sessionId = sessionId;
    this.#appCache = userDataPath === null
      ? null
      : new AppMetadataCacheStore(userDataPath);
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

  async listInstalledApps(): Promise<InstalledAppsSnapshot> {
    const connection = this.getConnection();
    if (connection === null) {
      return { apps: [], pending: [] };
    }
    const records = await this.#loadPackageRecords(connection);
    const cache = this.#appCache === null ? null : await this.#appCache.load();
    const apps = [...records.values()]
      .map((record): InstalledAppDto => {
        const cached = cache?.[record.packageName];
        return {
          packageName: record.packageName,
          name: cached?.name ?? record.packageName,
          system: record.system,
        };
      })
      .sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
      );
    const pending = cache === null
      ? []
      : [...records.values()]
          .filter((record) => {
            const cached = cache[record.packageName];
            return cached === undefined || isCacheStale(cached.cachedAt);
          })
          .map((record) => record.packageName)
          .sort((left, right) => {
            const leftSystem = records.get(left)?.system ?? true;
            const rightSystem = records.get(right)?.system ?? true;
            return leftSystem === rightSystem ? 0 : leftSystem ? 1 : -1;
          });
    return { apps, pending };
  }

  async enrichInstalledApps(packages: string[]): Promise<InstalledAppDto[]> {
    const connection = this.getConnection();
    if (connection === null || this.#appCache === null) {
      return [];
    }
    if (this.#packageRecords === null || this.#packageRecords.size === 0) {
      this.#packageRecords = await this.#loadPackageRecords(connection);
    }
    const records = this.#packageRecords;
    const cache = await this.#appCache.load();
    const toProcess = packages.filter((packageName) => {
      const record = records.get(packageName);
      const cached = cache[packageName];
      return record !== undefined &&
        (cached === undefined || isCacheStale(cached.cachedAt));
    });
    const freshEntries: Record<string, { name: string; cachedAt: number }> = {};
    await runPool(
      toProcess,
      Timing.INSTALLED_APPS_ENRICH_CONCURRENCY,
      async (packageName) => {
        const record = records.get(packageName);
        if (record === undefined) {
          return;
        }
        try {
          const dto = await readInstalledApp(connection.adb, record);
          freshEntries[packageName] = {
            name: dto.name,
            cachedAt: Date.now(),
          };
        } catch {
          // Keep the package uncached so a later attempt can retry.
        }
      },
    );
    await this.#appCache.update(freshEntries);
    const updatedCache = await this.#appCache.load();
    return packages.map((packageName) => {
      const record = records.get(packageName);
      const cached = updatedCache[packageName];
      return {
        packageName,
        name: cached?.name ?? record?.packageName ?? packageName,
        system: record?.system ?? false,
      } satisfies InstalledAppDto;
    });
  }

  async #loadPackageRecords(
    connection: DeviceConnection,
  ): Promise<Map<string, PackageRecord>> {
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
    const records = new Map<string, PackageRecord>();
    for (const record of parsePackageRecords(allOutput, userPackages)) {
      const existing = records.get(record.packageName);
      if (existing === undefined || /\/base\.apk$/.test(record.apkPath)) {
        records.set(record.packageName, record);
      }
    }
    this.#packageRecords = records;
    return records;
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

  pairWirelessDevice(input: WirelessPairInput): Promise<WirelessOperationResult> {
    return this.#enqueue(async () => {
      try {
        await this.#gateway.pairWirelessDevice(input);
        return { status: "ok" };
      } catch (error) {
        return this.#wirelessFailure(error);
      }
    });
  }

  connectWirelessDevice(input: WirelessConnectInput): Promise<WirelessOperationResult> {
    return this.#enqueue(async () => {
      try {
        await this.#gateway.connectWirelessDevice(input);
        const devices = await this.#gateway.listDevices();
        const device = devices.find(
          (item) => item.serial === input.address,
        );
        if (device === undefined) {
          return {
            status: "error",
            error: "operation-failed",
            message: `Wireless transport connected, but device ${input.address} was not found in the ADB device list.`,
          };
        }

        const session = await this.#connectLocked(device.transportId);
        if (session.status === "ok") {
          return { status: "ok" };
        }
        return {
          status: "error",
          error: "operation-failed",
          message: `Wireless transport connected, but the application session could not connect (${session.error}).`,
        };
      } catch (error) {
        return this.#wirelessFailure(error);
      }
    });
  }

  disconnectWirelessDevice(input: WirelessConnectInput): Promise<WirelessOperationResult> {
    return this.#enqueue(async () => {
      try {
        await this.#gateway.disconnectWirelessDevice(input);
        return { status: "ok" };
      } catch (error) {
        return this.#wirelessFailure(error);
      }
    });
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

  #wirelessFailure(error: unknown): WirelessOperationResult {
    if (error instanceof WirelessGatewayError) {
      return {
        status: "error",
        error: error.code,
        message: error.message,
      };
    }
    return {
      status: "error",
      error: "operation-failed",
      message: errorMessageOf(error),
    };
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
