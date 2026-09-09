import { assert, describe, test } from "vitest";
import type { Adb } from "@yume-chan/adb";

import type {
  DeviceConnection,
  DeviceGateway,
  DeviceInfo,
} from "../adb/device-session";
import { DeviceRegistryService } from "./device-registry";

class FakeConnection implements DeviceConnection {
  readonly adb = {} as Adb;
  closeCalls = 0;

  constructor(
    readonly transportId: string,
    readonly serial: string,
  ) {}

  async close(): Promise<void> {
    this.closeCalls += 1;
  }
}

class FakeGateway implements DeviceGateway {
  devices: DeviceInfo[] = [];
  readonly connections = new Map<string, FakeConnection>();
  disposeCalls = 0;

  async listDevices(): Promise<DeviceInfo[]> {
    return this.devices;
  }

  async connectDevice(device: DeviceInfo): Promise<DeviceConnection> {
    const connection = new FakeConnection(device.transportId, device.serial);
    this.connections.set(device.transportId, connection);
    return connection;
  }

  async pairWirelessDevice(): Promise<void> {}
  async connectWirelessDevice(): Promise<void> {}
  async disconnectWirelessDevice(): Promise<void> {}

  async dispose(): Promise<void> {
    this.disposeCalls += 1;
  }
}

function device(transportId: string): DeviceInfo {
  return {
    transportId,
    serial: `serial-${transportId}`,
    state: "device",
  };
}

describe("DeviceRegistryService", () => {
  test("keeps concurrent device sessions independent", async () => {
    const gateway = new FakeGateway();
    gateway.devices = [device("1"), device("2")];
    const registry = new DeviceRegistryService(gateway);

    const [first, second] = await Promise.all([
      registry.connectDevice("1"),
      registry.connectDevice("2"),
    ]);

    assert.equal(first.status, "ok");
    assert.equal(second.status, "ok");
    assert.equal(registry.listSessions().length, 2);
    assert.notEqual(
      registry.listSessions()[0]?.sessionId,
      registry.listSessions()[1]?.sessionId,
    );
  });

  test("disconnecting one session does not affect another and reconnects with a new id", async () => {
    const gateway = new FakeGateway();
    gateway.devices = [device("1"), device("2")];
    const registry = new DeviceRegistryService(gateway);
    const connected = await registry.connectDevice("1");
    await registry.connectDevice("2");
    assert.equal(connected.status, "ok");
    if (connected.status !== "ok") {
      return;
    }

    const oldSessionId = connected.session.sessionId;
    await registry.disconnectDevice(oldSessionId);
    const other = registry.listSessions().find((session) => session.transportId === "2");
    assert.equal(other?.state, "connected");
    assert.equal(registry.getSession(oldSessionId).state, "disconnected");

    const reconnected = await registry.connectDevice("1");
    assert.equal(reconnected.status, "ok");
    if (reconnected.status === "ok") {
      assert.notEqual(reconnected.session.sessionId, oldSessionId);
    }
  });

  test("same transport connection is idempotent", async () => {
    const gateway = new FakeGateway();
    gateway.devices = [device("1")];
    const registry = new DeviceRegistryService(gateway);

    const first = await registry.connectDevice("1");
    const second = await registry.connectDevice("1");

    assert.deepEqual(second, first);
    assert.equal(gateway.connections.size, 1);
  });

  test("wireless connect creates an independent session when another device is connected", async () => {
    const gateway = new FakeGateway();
    gateway.devices = [
      device("1"),
      { transportId: "2", serial: "10.0.0.2:5555", state: "device" },
    ];
    const registry = new DeviceRegistryService(gateway);
    await registry.connectDevice("1");

    const result = await registry.connectWirelessDevice({
      address: "10.0.0.2:5555",
    });

    assert.equal(result.status, "ok");
    assert.equal(registry.listSessions().length, 2);
    assert.equal(
      registry.listSessions().some((session) => session.transportId === "2"),
      true,
    );
  });

  test("disposes every session before disposing the shared gateway", async () => {
    const gateway = new FakeGateway();
    gateway.devices = [device("1"), device("2")];
    const registry = new DeviceRegistryService(gateway);
    await registry.connectDevice("1");
    await registry.connectDevice("2");

    await registry.dispose();

    assert.equal(gateway.connections.get("1")?.closeCalls, 1);
    assert.equal(gateway.connections.get("2")?.closeCalls, 1);
    assert.equal(gateway.disposeCalls, 1);
    assert.deepEqual(registry.listSessions(), []);
  });
});
