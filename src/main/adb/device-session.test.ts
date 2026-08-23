import { assert, describe, test } from "vitest";
import type { Adb } from "@yume-chan/adb";
import type { DeviceInfo } from "./device-session";
import {
  DeviceServerUnavailableError,
  DeviceSessionService,
  type DeviceConnection,
  type DeviceGateway,
} from "./device-session";
import { mapAdbServerDevice } from "./tango-adb-gateway";

function device(
  transportId: string,
  overrides: Partial<DeviceInfo> = {},
): DeviceInfo {
  return {
    transportId,
    serial: `serial-${transportId}`,
    state: "device",
    ...overrides,
  };
}

class FakeConnection implements DeviceConnection {
  readonly transportId: string;
  readonly serial: string;
  readonly adb = {} as Adb;
  closeCalls = 0;
  closeError: Error | null = null;

  constructor(transportId: string, serial: string) {
    this.transportId = transportId;
    this.serial = serial;
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
    if (this.closeError !== null) {
      throw this.closeError;
    }
  }
}

class FakeGateway implements DeviceGateway {
  devices: DeviceInfo[] = [];
  listFailures: Error[] = [];
  connectFailures: Error[] = [];
  connectDelayMs = 0;
  disposeCalls = 0;
  readonly connections = new Map<string, FakeConnection>();
  readonly wirelessCalls: string[] = [];
  wirelessFailures: Error[] = [];

  async listDevices(): Promise<DeviceInfo[]> {
    const failure = this.listFailures.shift();
    if (failure !== undefined) {
      throw failure;
    }
    return this.devices;
  }

  async connectDevice(info: DeviceInfo): Promise<DeviceConnection> {
    const failure = this.connectFailures.shift();
    if (failure !== undefined) {
      throw failure;
    }
    if (this.connectDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.connectDelayMs));
    }
    const connection = new FakeConnection(info.transportId, info.serial);
    this.connections.set(info.transportId, connection);
    return connection;
  }

  async pairWirelessDevice(input: { address: string; password: string }): Promise<void> {
    const failure = this.wirelessFailures.shift();
    if (failure !== undefined) {
      throw failure;
    }
    this.wirelessCalls.push(`pair:${input.address}:${input.password}`);
  }

  async connectWirelessDevice(input: { address: string }): Promise<void> {
    const failure = this.wirelessFailures.shift();
    if (failure !== undefined) {
      throw failure;
    }
    this.wirelessCalls.push(`connect:${input.address}`);
  }

  async disconnectWirelessDevice(input: { address: string }): Promise<void> {
    const failure = this.wirelessFailures.shift();
    if (failure !== undefined) {
      throw failure;
    }
    this.wirelessCalls.push(`disconnect:${input.address}`);
  }

  async dispose(): Promise<void> {
    this.disposeCalls += 1;
  }
}

describe("ADB server device mapping", () => {
  test("BigInt transport ids are serialized as decimal strings", () => {
    const dto = mapAdbServerDevice({
      serial: "52bd54bd",
      state: "device",
      product: "miku_odin",
      model: "2106118C",
      device: "odin",
      transportId: 9007199254740993n,
      authenticating: false,
    });
    assert.deepEqual(dto, {
      transportId: "9007199254740993",
      serial: "52bd54bd",
      state: "device",
      product: "miku_odin",
      model: "2106118C",
      device: "odin",
    });
  });

  test("absent metadata fields are omitted from the DTO", () => {
    const dto = mapAdbServerDevice({
      serial: "",
      state: "offline",
      transportId: 2n,
      authenticating: false,
    });
    assert.deepEqual(dto, {
      transportId: "2",
      serial: "",
      state: "offline",
    });
  });
});

describe("DeviceSessionService", () => {
  test("serializes wireless operations through the gateway", async () => {
    const gateway = new FakeGateway();
    const service = new DeviceSessionService(gateway);

    assert.deepEqual(
      await service.pairWirelessDevice({
        address: "192.168.1.10:37123",
        password: "123456",
      }),
      { status: "ok" },
    );
    assert.deepEqual(
      await service.connectWirelessDevice({ address: "192.168.1.10:5555" }),
      { status: "ok" },
    );
    assert.deepEqual(
      await service.disconnectWirelessDevice({ address: "192.168.1.10:5555" }),
      { status: "ok" },
    );
    assert.deepEqual(gateway.wirelessCalls, [
      "pair:192.168.1.10:37123:123456",
      "connect:192.168.1.10:5555",
      "disconnect:192.168.1.10:5555",
    ]);
  });

  test("maps wireless gateway failures to an IPC-safe result", async () => {
    const gateway = new FakeGateway();
    gateway.wirelessFailures.push(
      new Error("pairing failed: invalid code"),
    );
    const service = new DeviceSessionService(gateway);

    assert.deepEqual(
      await service.pairWirelessDevice({
        address: "192.168.1.10:37123",
        password: "123456",
      }),
      {
        status: "error",
        error: "operation-failed",
        message: "pairing failed: invalid code",
      },
    );
  });

  test("connect then disconnect drives the full session lifecycle", async () => {
    const gateway = new FakeGateway();
    gateway.devices = [device("2")];
    const service = new DeviceSessionService(gateway);

    assert.equal(service.getSession().state, "disconnected");
    assert.equal(service.getSession().transportId, null);

    const connect = await service.connectDevice("2");
    assert.deepEqual(connect, {
      status: "ok",
      session: {
        sessionId: service.sessionId,
        transportId: "2",
        serial: "serial-2",
        state: "connected",
        errorMessage: null,
      },
    });
    assert.equal(service.getSession().state, "connected");

    const disconnect = await service.disconnectDevice();
    assert.deepEqual(disconnect, {
      status: "ok",
      session: {
        sessionId: service.sessionId,
        transportId: null,
        serial: null,
        state: "disconnected",
        errorMessage: null,
      },
    });
    assert.equal(gateway.connections.get("2")?.closeCalls, 1);
  });

  test("connecting to the already-connected device is idempotent", async () => {
    const gateway = new FakeGateway();
    gateway.devices = [device("2"), device("3")];
    const service = new DeviceSessionService(gateway);
    await service.connectDevice("2");

    const again = await service.connectDevice("2");
    assert.deepEqual(again, { status: "ok", session: service.getSession() });
    assert.equal(gateway.connections.size, 1, "no second connection created");
    assert.equal(service.getSession().state, "connected");
  });

  test("connecting to a different device while connected returns session-busy", async () => {
    const gateway = new FakeGateway();
    gateway.devices = [device("2"), device("3")];
    const service = new DeviceSessionService(gateway);
    await service.connectDevice("2");

    const other = await service.connectDevice("3");
    assert.deepEqual(other, { status: "error", error: "session-busy" });
    assert.equal(service.getSession().state, "connected");
    assert.equal(service.getSession().transportId, "2");
    assert.equal(gateway.connections.has("3"), false);
  });

  test("a failing connect moves the session to error and a retry can recover", async () => {
    const gateway = new FakeGateway();
    gateway.devices = [device("2")];
    gateway.connectFailures.push(new Error("device vanished"));
    const service = new DeviceSessionService(gateway);

    const failed = await service.connectDevice("2");
    assert.deepEqual(failed, { status: "error", error: "connection-failed" });
    assert.equal(service.getSession().state, "error");
    assert.equal(service.getSession().errorMessage, "device vanished");
    assert.equal(service.getSession().transportId, "2");

    const retry = await service.connectDevice("2");
    assert.deepEqual(retry, { status: "ok", session: service.getSession() });
    assert.equal(service.getSession().state, "connected");
    assert.equal(service.getSession().errorMessage, null);
  });

  test("an unreachable server maps to server-unavailable", async () => {
    const gateway = new FakeGateway();
    gateway.listFailures.push(new DeviceServerUnavailableError("ECONNREFUSED"));
    const service = new DeviceSessionService(gateway);

    assert.deepEqual(await service.listDevices(), {
      status: "error",
      error: "server-unavailable",
    });

    gateway.listFailures.length = 0;
    gateway.devices = [device("2")];
    gateway.connectFailures.push(
      new DeviceServerUnavailableError("ECONNREFUSED"),
    );
    const connect = await service.connectDevice("2");
    assert.deepEqual(connect, { status: "error", error: "server-unavailable" });
    assert.equal(service.getSession().state, "error");
  });

  test("missing and not-ready devices produce typed failures", async () => {
    const gateway = new FakeGateway();
    gateway.devices = [device("2", { state: "unauthorized" })];
    const service = new DeviceSessionService(gateway);

    const missing = await service.connectDevice("9");
    assert.deepEqual(missing, { status: "error", error: "device-missing" });
    assert.equal(service.getSession().state, "error");

    const notReady = await service.connectDevice("2");
    assert.deepEqual(notReady, { status: "error", error: "device-not-ready" });
    assert.equal(gateway.connections.size, 0, "no connection for not-ready");
  });

  test("concurrent connect calls are serialized and the loser gets session-busy", async () => {
    const gateway = new FakeGateway();
    gateway.devices = [device("2"), device("3")];
    gateway.connectDelayMs = 30;
    const service = new DeviceSessionService(gateway);

    const [first, second] = await Promise.all([
      service.connectDevice("2"),
      service.connectDevice("3"),
    ]);
    assert.deepEqual(first, { status: "ok", session: service.getSession() });
    assert.deepEqual(second, { status: "error", error: "session-busy" });
    assert.equal(service.getSession().state, "connected");
    assert.equal(service.getSession().transportId, "2");
  });

  test("disconnect closes the underlying connection exactly once", async () => {
    const gateway = new FakeGateway();
    gateway.devices = [device("2")];
    const service = new DeviceSessionService(gateway);
    await service.connectDevice("2");
    const connection = gateway.connections.get("2");
    assert.ok(connection);

    await service.disconnectDevice();
    await service.disconnectDevice();
    assert.equal(connection.closeCalls, 1);
    assert.equal(service.getSession().state, "disconnected");
  });

  test("disconnect hooks run before the ADB connection closes", async () => {
    const gateway = new FakeGateway();
    gateway.devices = [device("2")];
    const service = new DeviceSessionService(gateway);
    await service.connectDevice("2");
    const connection = gateway.connections.get("2");
    assert.ok(connection);
    const observations: number[] = [];
    service.registerBeforeDisconnect(async (activeConnection) => {
      assert.equal(activeConnection, connection);
      observations.push(connection.closeCalls);
    });

    await service.disconnectDevice();
    assert.deepEqual(observations, [0]);
    assert.equal(connection.closeCalls, 1);
  });

  test("a failing close surfaces disconnect-failed without double closing", async () => {
    const gateway = new FakeGateway();
    gateway.devices = [device("2")];
    const service = new DeviceSessionService(gateway);
    await service.connectDevice("2");
    const connection = gateway.connections.get("2");
    assert.ok(connection);
    connection.closeError = new Error("socket gone");

    const result = await service.disconnectDevice();
    assert.deepEqual(result, { status: "error", error: "disconnect-failed" });
    assert.equal(service.getSession().state, "disconnected");
    assert.equal(connection.closeCalls, 1);
  });

  test("dispose disconnects the active session and releases the gateway", async () => {
    const gateway = new FakeGateway();
    gateway.devices = [device("2")];
    const service = new DeviceSessionService(gateway);
    await service.connectDevice("2");

    await service.dispose();
    await service.dispose();
    assert.equal(gateway.connections.get("2")?.closeCalls, 1);
    assert.equal(gateway.disposeCalls, 1);
    assert.equal(service.getSession().state, "disconnected");
  });

  test("the session id stays stable across states", async () => {
    const gateway = new FakeGateway();
    gateway.devices = [device("2")];
    const service = new DeviceSessionService(gateway, "session-primary");

    assert.equal(service.sessionId, "session-primary");
    await service.connectDevice("2");
    assert.equal(service.getSession().sessionId, "session-primary");
    await service.disconnectDevice();
    assert.equal(service.getSession().sessionId, "session-primary");
  });
});
