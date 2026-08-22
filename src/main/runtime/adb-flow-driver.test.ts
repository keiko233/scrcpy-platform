import { assert, describe, expect, test } from "vitest";

import type { DeviceSessionDto } from "../../shared/device-contracts";
import type { FlowNode, FlowNodeKind } from "../../shared/project-contracts";
import { AdbFlowActionDriver } from "./adb-flow-driver";
import type { FlowActionContext } from "./flow-runtime";

function node(
  type: FlowNodeKind,
  data: Record<string, unknown>,
): FlowNode {
  return {
    id: `${type}-1`,
    type,
    position: { x: 0, y: 0 },
    data: { kind: type, ...data } as FlowNode["data"],
  };
}

function fixture() {
  const commands: string[][] = [];
  const session: DeviceSessionDto = {
    sessionId: "session-1",
    transportId: "42",
    serial: "serial-1",
    state: "connected",
    errorMessage: null,
  };
  const connection = {
    transportId: "42",
    adb: {
      subprocess: {
        noneProtocol: {
          spawnWaitText: async (command: string[]) => {
            commands.push(command);
            return "";
          },
        },
      },
    },
  };
  const provider = {
    sessionId: "session-1",
    getSession: () => session,
    getConnection: () => connection,
  };
  return { driver: new AdbFlowActionDriver(provider), commands, session };
}

const CONTEXT: FlowActionContext = {
  runId: "run-1",
  deviceId: "42",
  sessionId: "session-1",
  displayId: 7,
};

describe("AdbFlowActionDriver", () => {
  test("uses exact per-display argument arrays for click and swipe", async () => {
    const { driver, commands } = fixture();
    await driver.execute(
      node("click", { x: 10.4, y: 20.6 }),
      CONTEXT,
      new AbortController().signal,
    );
    await driver.execute(
      node("swipe", {
        fromX: 1.2,
        fromY: 2.3,
        toX: 30.6,
        toY: 40.8,
        durationMs: 299.7,
      }),
      CONTEXT,
      new AbortController().signal,
    );

    assert.deepEqual(commands, [
      ["input", "-d", "7", "tap", "10", "21"],
      ["input", "-d", "7", "swipe", "1", "2", "31", "41", "300"],
    ]);
  });

  test("rejects invalid data, changed sessions, and aborted actions", async () => {
    const { driver, session } = fixture();
    await expect(
      driver.execute(
        node("click", { x: -1, y: 2 }),
        CONTEXT,
        new AbortController().signal,
      ),
    ).rejects.toThrow();

    session.state = "disconnected";
    await expect(
      driver.execute(
        node("click", { x: 1, y: 2 }),
        CONTEXT,
        new AbortController().signal,
      ),
    ).rejects.toThrow(/session changed/);

    const controller = new AbortController();
    controller.abort();
    await expect(
      driver.execute(node("click", { x: 1, y: 2 }), CONTEXT, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
