import { z } from "zod";

import type { FlowNode } from "../../shared/project-contracts";
import type { DeviceSessionDto } from "../../shared/device-contracts";
import type {
  FlowActionContext,
  FlowActionDriver,
  FlowRunTarget,
} from "./flow-runtime";

interface AdbCommandRunner {
  spawnWaitText(command: string[]): Promise<string>;
}

interface AdbConnectionLike {
  transportId: string;
  adb: {
    subprocess: {
      noneProtocol: AdbCommandRunner;
    };
  };
}

export interface AdbFlowSessionProvider {
  readonly sessionId: string;
  getSession(): DeviceSessionDto;
  getConnection(): AdbConnectionLike | null;
}

const CoordinateSchema = z.number().finite().nonnegative();

const ClickDataSchema = z
  .object({ x: CoordinateSchema, y: CoordinateSchema })
  .passthrough();

const SwipeDataSchema = z
  .object({
    fromX: CoordinateSchema,
    fromY: CoordinateSchema,
    toX: CoordinateSchema,
    toY: CoordinateSchema,
    durationMs: z.number().finite().nonnegative(),
  })
  .passthrough();

const LaunchAppDataSchema = z
  .object({
    packageName: z.string().trim().min(1),
    activity: z.string().trim().optional(),
  })
  .passthrough();

function abortIfNeeded(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("Flow action cancelled.", "AbortError");
  }
}

function integer(value: number): string {
  return String(Math.round(value));
}

export class AdbFlowActionDriver implements FlowActionDriver {
  readonly #session: AdbFlowSessionProvider;

  constructor(session: AdbFlowSessionProvider) {
    this.#session = session;
  }

  getTarget(): FlowRunTarget | null {
    const connection = this.#session.getConnection();
    const snapshot = this.#session.getSession();
    if (connection === null || snapshot.state !== "connected") {
      return null;
    }
    return {
      deviceId: connection.transportId,
      sessionId: this.#session.sessionId,
    };
  }

  async execute(
    node: FlowNode,
    context: FlowActionContext,
    signal: AbortSignal,
  ): Promise<void> {
    abortIfNeeded(signal);
    const target = this.getTarget();
    if (
      target === null ||
      target.deviceId !== context.deviceId ||
      target.sessionId !== context.sessionId
    ) {
      throw new Error("The connected Android device session changed during the run.");
    }
    const connection = this.#session.getConnection();
    if (connection === null) {
      throw new Error("The Android device disconnected during the run.");
    }

    let command: string[];
    switch (node.type) {
      case "click": {
        const data = ClickDataSchema.parse(node.data);
        command = [
          "input",
          "-d",
          String(context.displayId),
          "tap",
          integer(data.x),
          integer(data.y),
        ];
        break;
      }
      case "swipe": {
        const data = SwipeDataSchema.parse(node.data);
        command = [
          "input",
          "-d",
          String(context.displayId),
          "swipe",
          integer(data.fromX),
          integer(data.fromY),
          integer(data.toX),
          integer(data.toY),
          integer(data.durationMs),
        ];
        break;
      }
      case "launch-app": {
        const data = LaunchAppDataSchema.parse(node.data);
        const activity = data.activity ?? "";
        command =
          activity.length === 0
            ? [
                "monkey",
                "--display",
                String(context.displayId),
                "-p",
                data.packageName,
                "-c",
                "android.intent.category.LAUNCHER",
                "1",
              ]
            : [
                "am",
                "start",
                "--display",
                String(context.displayId),
                "-n",
                `${data.packageName}/${activity}`,
              ];
        break;
      }
      default:
        throw new Error(`ADB driver cannot execute node type "${node.type}".`);
    }

    await connection.adb.subprocess.noneProtocol.spawnWaitText(command);
    abortIfNeeded(signal);
  }
}
