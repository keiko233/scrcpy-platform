import type {
  ConnectDeviceResult,
  DeviceSessionDto,
  DisconnectDeviceResult,
  InstalledAppDto,
  InstalledAppsSnapshot,
  ListDevicesResult,
  WirelessConnectInput,
  WirelessConnectResult,
  WirelessOperationResult,
  WirelessPairInput,
} from "../../shared/device-contracts";
import type {
  DeviceGateway,
  DeviceSessionService,
} from "../adb/device-session";
import { DeviceSessionService as Session } from "../adb/device-session";

export type DeviceRegistryListener = (session: DeviceSessionDto) => void;

interface RegistrySession {
  service: Session;
  removeListener: () => void;
}

function disconnectedSession(): DeviceSessionDto {
  return {
    sessionId: "no-device-session",
    transportId: null,
    serial: null,
    state: "disconnected",
    errorMessage: null,
  };
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Owns all active device sessions while keeping the existing per-session ADB
 * implementation intact. A session is never reused after disconnect, so all
 * screen and run scopes become stale when a device reconnects.
 */
export class DeviceRegistryService {
  readonly #gateway: DeviceGateway;
  readonly #userDataPath: string | null;
  readonly #sessions = new Map<string, RegistrySession>();
  readonly #listeners = new Set<DeviceRegistryListener>();
  #queue: Promise<void> = Promise.resolve();
  #disposePromise: Promise<void> | null = null;

  constructor(gateway: DeviceGateway, userDataPath: string | null = null) {
    this.#gateway = gateway;
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
      return { status: "ok", devices: await this.#gateway.listDevices() };
    } catch {
      return { status: "error", error: "server-unavailable" };
    }
  }

  listSessions(): DeviceSessionDto[] {
    return [...this.#sessions.values()]
      .map(({ service }) => service.getSession())
      .sort((left, right) => left.sessionId.localeCompare(right.sessionId));
  }

  getSession(sessionId?: string): DeviceSessionDto {
    if (sessionId !== undefined) {
      return this.#sessions.get(sessionId)?.service.getSession() ?? {
        ...disconnectedSession(),
        sessionId,
      };
    }
    return this.listSessions().find((session) => session.state === "connected") ??
      this.listSessions()[0] ??
      disconnectedSession();
  }

  getSessionService(sessionId: string): Session | null {
    return this.#sessions.get(sessionId)?.service ?? null;
  }

  subscribe(listener: DeviceRegistryListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async connectDevice(transportId: string): Promise<ConnectDeviceResult> {
    return await this.#enqueue(async () => {
      const existing = this.listSessions().find(
        (session) =>
          session.transportId === transportId &&
          session.state === "connected",
      );
      if (existing !== undefined) {
        return { status: "ok", session: existing };
      }

      const sessionId = `session-${crypto.randomUUID()}`;
      const service = new Session(
        this.#gateway,
        sessionId,
        this.#userDataPath,
        { disposeGateway: false, cacheScope: sessionId },
      );
      const removeListener = service.subscribe((session) => {
        for (const listener of this.#listeners) {
          try {
            listener(session);
          } catch (error) {
            console.error(
              "device registry listener failed",
              errorMessageOf(error),
            );
          }
        }
      });
      this.#sessions.set(service.sessionId, { service, removeListener });
      const result = await service.connectDevice(transportId);
      if (result.status === "error") {
        removeListener();
        this.#sessions.delete(service.sessionId);
        await service.dispose().catch(() => undefined);
      }
      return result;
    });
  }

  async disconnectDevice(sessionId?: string): Promise<DisconnectDeviceResult> {
    return await this.#enqueue(async () => {
      const target = sessionId === undefined
        ? this.listSessions().find((session) => session.state === "connected")
        : this.getSession(sessionId);
      if (target === undefined || target.state === "disconnected") {
        return {
          status: "ok",
          session: sessionId === undefined
            ? disconnectedSession()
            : { ...disconnectedSession(), sessionId },
        };
      }
      const entry = this.#sessions.get(target.sessionId);
      if (entry === undefined) {
        return {
          status: "ok",
          session: { ...disconnectedSession(), sessionId: target.sessionId },
        };
      }
      const result = await entry.service.disconnectDevice();
      entry.removeListener();
      this.#sessions.delete(target.sessionId);
      return result;
    });
  }

  async pairWirelessDevice(input: WirelessPairInput): Promise<WirelessOperationResult> {
    try {
      await this.#gateway.pairWirelessDevice(input);
      return { status: "ok" };
    } catch (error) {
      return {
        status: "error",
        error: "operation-failed",
        message: errorMessageOf(error),
      };
    }
  }

  async connectWirelessDevice(input: WirelessConnectInput): Promise<WirelessConnectResult> {
    try {
      await this.#gateway.connectWirelessDevice(input);
      const devices = await this.#gateway.listDevices();
      const device = devices.find((item) => item.serial === input.address);
      if (device === undefined) {
        return {
          status: "error",
          error: "operation-failed",
          message: `Wireless transport connected, but device ${input.address} was not found in the ADB device list.`,
        };
      }
      const result = await this.connectDevice(device.transportId);
      return result.status === "ok"
        ? result
        : {
            status: "error",
            error: "operation-failed",
            message: `Wireless transport connected, but the application session could not connect (${result.error}).`,
          };
    } catch (error) {
      return {
        status: "error",
        error: "operation-failed",
        message: errorMessageOf(error),
      };
    }
  }

  async disconnectWirelessDevice(input: WirelessConnectInput): Promise<WirelessOperationResult> {
    try {
      await this.#gateway.disconnectWirelessDevice(input);
      return { status: "ok" };
    } catch (error) {
      return {
        status: "error",
        error: "operation-failed",
        message: errorMessageOf(error),
      };
    }
  }

  async listInstalledApps(sessionId?: string): Promise<InstalledAppsSnapshot> {
    return (this.#findService(sessionId)?.listInstalledApps() ??
      Promise.resolve({ apps: [], pending: [] }));
  }

  async enrichInstalledApps(
    packages: string[],
    sessionId?: string,
  ): Promise<InstalledAppDto[]> {
    return (this.#findService(sessionId)?.enrichInstalledApps(packages) ??
      Promise.resolve([]));
  }

  dispose(timeoutMs = 4000): Promise<void> {
    this.#disposePromise ??= this.#disposeOnce(timeoutMs);
    return this.#disposePromise;
  }

  async #disposeOnce(timeoutMs: number): Promise<void> {
    const cleanup = Promise.allSettled(
      [...this.#sessions.values()].map(({ service }) => service.dispose()),
    ).then(() => this.#gateway.dispose());
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
      for (const { removeListener } of this.#sessions.values()) {
        removeListener();
      }
      this.#sessions.clear();
    }
  }

  #firstService(): Session | null {
    return this.listSessions().length === 0
      ? null
      : this.#sessions.values().next().value?.service ?? null;
  }

  #findService(sessionId?: string): Session | null {
    if (sessionId !== undefined) {
      return this.#sessions.get(sessionId)?.service ?? null;
    }
    return this.#firstService();
  }
}

export type DeviceRegistryServiceLike = Pick<
  DeviceRegistryService,
  | "listDevices"
  | "listSessions"
  | "getSession"
  | "getSessionService"
  | "subscribe"
  | "connectDevice"
  | "disconnectDevice"
  | "pairWirelessDevice"
  | "connectWirelessDevice"
  | "disconnectWirelessDevice"
  | "listInstalledApps"
  | "enrichInstalledApps"
>;

export type DeviceSessionServiceLike = DeviceSessionService;
