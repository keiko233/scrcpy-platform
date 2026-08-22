import { readFile } from "node:fs/promises";

import type { Adb } from "@yume-chan/adb";
import { AdbScrcpyClient, AdbScrcpyOptions3_3_3 } from "@yume-chan/adb-scrcpy";
import { BIN as SCRCPY_SERVER_BINARY } from "@yume-chan/fetch-scrcpy-server";
import {
  AndroidKeyCode,
  AndroidKeyEventAction,
  AndroidMotionEventAction,
  AndroidMotionEventButton,
  AndroidScreenPowerMode,
  ScrcpyInstanceId,
  ScrcpyPointerId,
} from "@yume-chan/scrcpy";
import type {
  ScrcpyControlMessageWriter,
  ScrcpyMediaStreamPacket,
} from "@yume-chan/scrcpy";
import { ReadableStream, WritableStream } from "@yume-chan/stream-extra";
import type { ReadableStreamDefaultReader } from "@yume-chan/stream-extra";

import type {
  AndroidDisplayDto,
  CreateVirtualDisplayInput,
  DeviceButton,
  InjectScreenTouchInput,
  ScreenFailureCode,
  ScreenOperationResult,
  ScreenSessionDto,
  ScreenVideoMessage,
  ScrcpySettings,
} from "../../shared/screen-contracts";
import { DEFAULT_SCRCPY_SETTINGS } from "../../shared/screen-contracts";
import type { DeviceSessionService } from "./device-session";
import {
  filterManageableDisplays,
  findAddedVirtualDisplayId,
  mergeDisplayCatalog,
  parseDisplayDetails,
  parseDisplayIds,
} from "./display-catalog";
import { DisplayIdDeviceMessageParser } from "./display-id-message";
import { FilePath, MediaConstants } from "../../shared/constants/app";
import { Timing } from "../../shared/constants/timing";

const SCRCPY_SERVER_PATH = FilePath.SCRCPY_SERVER;

// scrcpy always captures 48kHz stereo PCM before encoding (see `AudioConfig` in
// the server). The renderer needs these to configure its audio decoder.
const AUDIO_SAMPLE_RATE = MediaConstants.AUDIO_SAMPLE_RATE;
const AUDIO_CHANNELS = MediaConstants.AUDIO_CHANNELS;

type ScrcpyOptions = AdbScrcpyOptions3_3_3<true>;
type ScrcpyClient = AdbScrcpyClient<ScrcpyOptions>;

export interface ScreenVideoPort {
  postMessage(message: ScreenVideoMessage): void;
  close(): void;
}

interface ManagedScrcpyClient {
  client: ScrcpyClient;
  scid: string;
  serverPath: string;
  streamId: string;
  reader: ReadableStreamDefaultReader<ScrcpyMediaStreamPacket>;
  outputDone: Promise<void>;
  videoDone: Promise<void>;
  audioDone: Promise<void>;
  removeSizeListener: () => void;
  closing: boolean;
  publishVideo: boolean;
  codec: number;
  configuration: ScrcpyMediaStreamPacket | null;
  audioCodec: string | null;
  audioConfiguration: ScrcpyMediaStreamPacket | null;
  width: number;
  height: number;
  touchActive: boolean;
  touchX: number;
  touchY: number;
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const BUTTON_KEY_CODES: Record<DeviceButton, AndroidKeyCode> = {
  back: AndroidKeyCode.AndroidBack,
  home: AndroidKeyCode.AndroidHome,
  "app-switch": AndroidKeyCode.AndroidAppSwitch,
  power: AndroidKeyCode.Power,
  "volume-up": AndroidKeyCode.VolumeUp,
  "volume-down": AndroidKeyCode.VolumeDown,
};

/**
 * Owns scrcpy and virtual-display lifetime for the currently connected ADB
 * session. The service lives in Electron main and keeps consuming video even
 * when no renderer is attached, so Android processes never depend on a window.
 */
export class ScreenSessionService {
  readonly #deviceSession: DeviceSessionService;
  #state: ScreenSessionDto["state"] = "disconnected";
  #displays: AndroidDisplayDto[] = [];
  #activeDisplayId: number | null = null;
  #ownedVirtualDisplayId: number | null = null;
  #stream: ManagedScrcpyClient | null = null;
  #displayOwner: ManagedScrcpyClient | null = null;
  #videoPort: ScreenVideoPort | null = null;
  #videoConfiguration: ScrcpyMediaStreamPacket | null = null;
  #videoCodec: number | null = null;
  #audioConfiguration: ScrcpyMediaStreamPacket | null = null;
  #audioCodec: string | null = null;
  #videoWidth = 0;
  #videoHeight = 0;
  #errorMessage: string | null = null;
  #settings: ScrcpySettings = { ...DEFAULT_SCRCPY_SETTINGS };
  #queue: Promise<void> = Promise.resolve();
  #disposed = false;
  readonly #removeDisconnectHook: () => void;

  constructor(deviceSession: DeviceSessionService) {
    this.#deviceSession = deviceSession;
    this.#removeDisconnectHook = deviceSession.registerBeforeDisconnect(
      (connection) => this.#enqueue(() => this.#stopLocked(connection.adb)),
    );
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.#queue.then(operation, operation);
    this.#queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  getSnapshot(): ScreenSessionDto {
    const connection = this.#deviceSession.getConnection();
    if (connection === null && this.#state !== "disconnected") {
      this.#state = "disconnected";
    }
    return {
      sessionId: this.#deviceSession.sessionId,
      serial: connection?.serial ?? null,
      state: connection === null ? "disconnected" : this.#state,
      displays: this.#displays,
      activeDisplayId: this.#activeDisplayId,
      ownedVirtualDisplayId: this.#ownedVirtualDisplayId,
      streamId: this.#stream?.streamId ?? null,
      videoCodec: this.#videoCodec,
      videoWidth: this.#videoWidth,
      videoHeight: this.#videoHeight,
      errorMessage: this.#errorMessage,
    };
  }

  getSettings(): ScrcpySettings {
    return { ...this.#settings };
  }

  setSettings(settings: ScrcpySettings): void {
    this.#settings = { ...settings };
  }

  refreshDisplays(): Promise<ScreenOperationResult> {
    return this.#enqueue(async () => {
      const connection = this.#deviceSession.getConnection();
      if (connection === null) {
        return this.#failure("not-connected", "Connect an Android device first.");
      }
      try {
        this.#displays = await this.#listDisplays();
        if (this.#state === "disconnected") {
          this.#state = "idle";
        }
        this.#errorMessage = null;
        return { status: "ok", screen: this.getSnapshot() };
      } catch (error) {
        return this.#operationFailure("Could not read Android displays", error);
      }
    });
  }

  startDisplay(displayId: number): Promise<ScreenOperationResult> {
    return this.#enqueue(async () => {
      const connection = this.#deviceSession.getConnection();
      if (connection === null) {
        return this.#failure("not-connected", "Connect an Android device first.");
      }
      this.#state = this.#stream === null ? "starting" : "switching";
      this.#errorMessage = null;
      try {
        this.#displays = await this.#listDisplays();
        if (!this.#displays.some((display) => display.displayId === displayId)) {
          return this.#failure(
            "display-not-found",
            `Android display ${displayId} is no longer available.`,
          );
        }
        await this.#replaceStream(displayId);
        this.#state = "streaming";
        return { status: "ok", screen: this.getSnapshot() };
      } catch (error) {
        return this.#operationFailure("Could not start the screen stream", error);
      }
    });
  }

  createVirtualDisplay(
    input: CreateVirtualDisplayInput,
  ): Promise<ScreenOperationResult> {
    return this.#enqueue(async () => {
      if (this.#deviceSession.getConnection() === null) {
        return this.#failure("not-connected", "Connect an Android device first.");
      }
      if (this.#displayOwner !== null || this.#ownedVirtualDisplayId !== null) {
        return this.#failure(
          "virtual-display-exists",
          "This device session already owns a virtual display.",
        );
      }

      this.#state = "switching";
      this.#errorMessage = null;
      let owner: ManagedScrcpyClient | null = null;
      try {
        const before = await this.#listDisplays();
        const ownerOptions = this.#createOptions({
          newDisplay: `${input.width}x${input.height}/${input.dpi}`,
        });
        const displayIdMessage = new DisplayIdDeviceMessageParser();
        ownerOptions.deviceMessageParsers.add(displayIdMessage);
        owner = await this.#startClient(ownerOptions, false);
        this.#displayOwner = owner;

        const reportedDisplayId = await Promise.race([
          displayIdMessage.displayId.catch(() => undefined),
          delay(Timing.SCRCPY_DISPLAY_REPORT_TIMEOUT_MS).then(() => undefined),
        ]);
        const discovered =
          reportedDisplayId === undefined
            ? await this.#waitForAddedDisplay(before)
            : {
                displays: await this.#listDisplays(),
                displayId: reportedDisplayId,
              };
        if (discovered.displayId === undefined) {
          throw new Error(
            "scrcpy started, but Android did not report a new virtual display ID",
          );
        }
        this.#ownedVirtualDisplayId = discovered.displayId;
        this.#displays = await this.#listDisplays();

        if (input.packageName !== undefined) {
          const controller = owner.client.controller;
          if (controller === undefined) {
            throw new Error("scrcpy control channel is unavailable");
          }
          await controller.startApp(input.packageName, { forceStop: true });
        }

        await this.#replaceStream(discovered.displayId);
        this.#state = "streaming";
        return { status: "ok", screen: this.getSnapshot() };
      } catch (error) {
        if (owner !== null) {
          await this.#closeManaged(owner).catch(() => undefined);
        }
        if (this.#displayOwner === owner) {
          this.#displayOwner = null;
        }
        this.#ownedVirtualDisplayId = null;
        return this.#operationFailure("Could not create a virtual display", error);
      }
    });
  }

  destroyVirtualDisplay(): Promise<ScreenOperationResult> {
    return this.#enqueue(async () => {
      const owner = this.#displayOwner;
      const ownedDisplayId = this.#ownedVirtualDisplayId;
      if (owner === null || ownedDisplayId === null) {
        return { status: "ok", screen: this.getSnapshot() };
      }
      this.#state = "switching";
      this.#errorMessage = null;
      try {
        if (this.#activeDisplayId === ownedDisplayId) {
          const mainDisplayId =
            this.#displays.find((display) => display.primary)?.displayId ?? 0;
          await this.#replaceStream(mainDisplayId);
        }
        this.#displayOwner = null;
        await this.#closeManaged(owner);
        this.#ownedVirtualDisplayId = null;
        this.#displays = await this.#listDisplays();
        this.#state = this.#stream === null ? "idle" : "streaming";
        return { status: "ok", screen: this.getSnapshot() };
      } catch (error) {
        return this.#operationFailure("Could not destroy the virtual display", error);
      }
    });
  }

  pressButton(button: DeviceButton): Promise<ScreenOperationResult> {
    return this.#enqueue(async () => {
      const controller = this.#controller();
      if (controller === null) {
        return this.#failure(
          "not-streaming",
          "Start a display stream before sending device buttons.",
        );
      }
      try {
        const keyCode = BUTTON_KEY_CODES[button];
        await controller.injectKeyCode({
          action: AndroidKeyEventAction.Down,
          keyCode,
          repeat: 0,
          metaState: 0,
        });
        await controller.injectKeyCode({
          action: AndroidKeyEventAction.Up,
          keyCode,
          repeat: 0,
          metaState: 0,
        });
        return { status: "ok", screen: this.getSnapshot() };
      } catch (error) {
        return this.#operationFailure("Could not send the device button", error);
      }
    });
  }

  injectTouch(input: InjectScreenTouchInput): Promise<ScreenOperationResult> {
    return this.#enqueue(async () => {
      const stream = this.#stream;
      const controller = stream?.client.controller;
      if (
        stream === null ||
        controller === undefined ||
        this.#activeDisplayId !== input.displayId ||
        stream.width === 0 ||
        stream.height === 0
      ) {
        return this.#failure(
          "not-streaming",
          "The selected display does not have an active video/control stream.",
        );
      }
      try {
        const actions = {
          down: AndroidMotionEventAction.Down,
          move: AndroidMotionEventAction.Move,
          up: AndroidMotionEventAction.Up,
          // scrcpy 3.3.3 doesn't remove a finger from its pointer state for
          // ACTION_CANCEL. Send ACTION_UP so a browser-side pointer cancel
          // can't leave Android with a permanently pressed virtual finger.
          cancel: AndroidMotionEventAction.Up,
        } as const;
        const released = input.action === "up" || input.action === "cancel";
        const pointerX = input.x * stream.width;
        const pointerY = input.y * stream.height;
        await controller.injectTouch({
          action: actions[input.action],
          pointerId: ScrcpyPointerId.Finger,
          pointerX,
          pointerY,
          videoWidth: stream.width,
          videoHeight: stream.height,
          pressure: released ? 0 : 1,
          actionButton: AndroidMotionEventButton.Primary,
          buttons: released ? 0 : AndroidMotionEventButton.Primary,
        });
        stream.touchActive = !released;
        stream.touchX = input.x;
        stream.touchY = input.y;
        return { status: "ok", screen: this.getSnapshot() };
      } catch (error) {
        return this.#operationFailure("Could not inject touch input", error);
      }
    });
  }

  attachVideoPort(streamId: string, port: ScreenVideoPort): void {
    const stream = this.#stream;
    if (stream === null || stream.streamId !== streamId || this.#videoCodec === null) {
      console.warn("scrcpy video port rejected", {
        requestedStreamId: streamId,
        activeStreamId: stream?.streamId ?? null,
        hasCodec: this.#videoCodec !== null,
      });
      try {
        port.postMessage({
          type: "stopped",
          streamId,
          reason: "The requested screen stream is no longer active.",
        });
      } catch {
        // The requesting renderer may have gone away before handoff completed.
      }
      port.close();
      return;
    }
    this.#closeVideoPort("The monitor renderer was replaced.");
    this.#videoPort = port;
    try {
      console.debug("scrcpy video port attached", {
        streamId,
        hasConfiguration: this.#videoConfiguration !== null,
      });
      port.postMessage({
        type: "metadata",
        streamId,
        codec: this.#videoCodec,
      });
      if (this.#videoConfiguration !== null) {
        this.#publishPacket(this.#videoConfiguration);
      }
      if (this.#audioCodec !== null) {
        port.postMessage({
          type: "audio-metadata",
          streamId,
          codec: this.#audioCodec,
          sampleRate: AUDIO_SAMPLE_RATE,
          channels: AUDIO_CHANNELS,
        });
        if (this.#audioConfiguration !== null) {
          this.#publishAudioPacket(this.#audioConfiguration);
        }
      }
      void stream.client.controller?.resetVideo().catch(() => undefined);
    } catch {
      if (this.#videoPort === port) {
        this.#videoPort = null;
      }
      port.close();
    }
  }

  async dispose(): Promise<void> {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#removeDisconnectHook();
    await this.#enqueue(() => this.#stopLocked());
  }

  async #stopLocked(adbOverride?: Adb): Promise<void> {
    this.#closeVideoPort("The device session stopped.");
    const stream = this.#stream;
    const owner = this.#displayOwner;
    this.#stream = null;
    this.#displayOwner = null;
    await this.#closeManaged(stream, adbOverride).catch(() => undefined);
    await this.#closeManaged(owner, adbOverride).catch(() => undefined);
    const adb = adbOverride ?? this.#deviceSession.getConnection()?.adb;
    if (adb !== undefined) {
      await adb.subprocess.noneProtocol
        .spawnWait(["rm", "-f", SCRCPY_SERVER_PATH])
        .catch(() => undefined);
    }
    this.#state = "disconnected";
    this.#displays = [];
    this.#activeDisplayId = null;
    this.#ownedVirtualDisplayId = null;
    this.#videoConfiguration = null;
    this.#videoCodec = null;
    this.#audioConfiguration = null;
    this.#audioCodec = null;
    this.#videoWidth = 0;
    this.#videoHeight = 0;
    this.#errorMessage = null;
  }

  async #pushServer(adb: Adb, serverPath: string): Promise<void> {
    const buffer = await readFile(SCRCPY_SERVER_BINARY);
    const file = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(buffer));
        controller.close();
      },
    });
    await AdbScrcpyClient.pushServer(adb, file, serverPath);
  }

  #createOptions(
    target: {
      displayId?: number;
      newDisplay?: string;
      maxSize?: number;
      maxFps?: number;
      videoBitRate?: number;
    },
  ): ScrcpyOptions {
    const settings = this.#settings;
    return new AdbScrcpyOptions3_3_3({
      tunnelForward: false,
      audio: settings.audio,
      audioSource: settings.audioSource,
      audioCodec: settings.audioCodec,
      audioBitRate: settings.audioBitRate,
      video: true,
      control: true,
      sendDeviceMeta: true,
      sendFrameMeta: true,
      sendCodecMeta: true,
      // Cleanup restores screen power, show-touches, and stay-awake state.
      // The server JAR is also unlinked on startup, so #startClient gives each
      // concurrently managed scrcpy instance its own temporary copy.
      cleanup: true,
      scid: ScrcpyInstanceId.random(),
      ...(target.maxSize !== undefined
        ? { maxSize: target.maxSize }
        : settings.maxSize === null
          ? {}
          : { maxSize: settings.maxSize }),
      maxFps: target.maxFps ?? settings.maxFps,
      videoBitRate: target.videoBitRate ?? settings.videoBitRate,
      videoCodec: settings.videoCodec,
      stayAwake: settings.stayAwake,
      showTouches: settings.showTouches,
      powerOffOnClose: settings.powerOffOnClose,
      displayId: target.displayId,
      newDisplay: target.newDisplay,
    });
  }

  async #startClient(
    options: ScrcpyOptions,
    publishVideo: boolean,
  ): Promise<ManagedScrcpyClient> {
    const connection = this.#deviceSession.getConnection();
    if (connection === null) {
      throw new Error("Android device is not connected");
    }
    const scid =
      typeof options.value.scid === "string"
        ? options.value.scid
        : options.value.scid.value.toString(16);
    const serverPath = `${SCRCPY_SERVER_PATH}.${scid}.jar`;
    const startedAt = Date.now();
    console.info("scrcpy client starting", { scid, serverPath, publishVideo });
    await this.#pushServer(connection.adb, serverPath);
    let client: ScrcpyClient;
    try {
      client = await AdbScrcpyClient.start(connection.adb, serverPath, options);
      console.info("scrcpy client connected", {
        scid,
        elapsedMs: Date.now() - startedAt,
      });
    } catch (error) {
      await connection.adb.subprocess.noneProtocol
        .spawnWait(["rm", "-f", serverPath])
        .catch(() => undefined);
      throw error;
    }
    const recentOutput: string[] = [];
    const outputDone = client.output
      .pipeTo(
        new WritableStream({
          write(line: string) {
            recentOutput.push(line);
            if (recentOutput.length > 40) {
              recentOutput.shift();
            }
          },
        }),
      )
      .catch(() => undefined);

    try {
      const video = await client.videoStream;
      const reader = video.stream.getReader();
      const streamId = `stream-${crypto.randomUUID()}`;
      const managed = {
        client,
        scid,
        serverPath,
        streamId,
        reader,
        outputDone,
        videoDone: Promise.resolve(),
        audioDone: Promise.resolve(),
        removeSizeListener: () => {},
        closing: false,
        publishVideo,
        codec: video.metadata.codec,
        configuration: null,
        audioCodec: null,
        audioConfiguration: null,
        width: video.width,
        height: video.height,
        touchActive: false,
        touchX: 0,
        touchY: 0,
      } satisfies ManagedScrcpyClient;
      managed.removeSizeListener = video.sizeChanged(({ width, height }) => {
        managed.width = width;
        managed.height = height;
        console.info("scrcpy video size changed", {
          scid,
          width,
          height,
          elapsedMs: Date.now() - startedAt,
        });
        if (managed.publishVideo && this.#stream === managed) {
          this.#videoWidth = width;
          this.#videoHeight = height;
        }
      });
      console.info("scrcpy video stream ready", {
        scid,
        streamId,
        codec: video.metadata.codec,
        width: video.width,
        height: video.height,
        elapsedMs: Date.now() - startedAt,
      });
      managed.videoDone = this.#consumeVideo(managed);
      managed.audioDone = this.#consumeAudio(managed);
      if (this.#settings.turnScreenOff) {
        void client.controller
          ?.setScreenPowerMode(AndroidScreenPowerMode.Off)
          .catch(() => undefined);
      }
      return managed;
    } catch (error) {
      await client.controller?.close().catch(() => undefined);
      await client.close().catch(() => undefined);
      await connection.adb.subprocess.noneProtocol
        .spawnWait(["rm", "-f", serverPath])
        .catch(() => undefined);
      throw new Error(
        recentOutput.length === 0
          ? errorMessageOf(error)
          : `${errorMessageOf(error)}\nscrcpy: ${recentOutput.slice(-6).join(" | ")}`,
      );
    }
  }

  async #consumeAudio(managed: ManagedScrcpyClient): Promise<void> {
    try {
      const audio = await managed.client.audioStream;
      if (audio?.type !== "success") {
        return;
      }
      managed.audioCodec = audio.codec.optionValue;
      console.info("scrcpy audio stream ready", {
        scid: managed.scid,
        codec: managed.audioCodec,
      });
      await audio.stream.pipeTo(
        new WritableStream<ScrcpyMediaStreamPacket>({
          write: (packet) => {
            if (packet.type === "configuration") {
              managed.audioConfiguration = {
                ...packet,
                data: packet.data.slice(),
              };
            }
            if (managed.publishVideo && this.#stream === managed) {
              this.#publishAudioPacket(packet);
            }
          },
        }),
      );
    } catch {
      // Video/control remain usable when audio capture isn't supported.
    }
  }

  async #consumeVideo(
    managed: ManagedScrcpyClient,
  ): Promise<void> {
    let packetCount = 0;
    if (managed.publishVideo) {
      this.#videoCodec = managed.codec;
    }
    try {
      while (true) {
        const result = await managed.reader.read();
        if (result.done) {
          console.warn("scrcpy video stream ended", {
            scid: managed.scid,
            packetCount,
            closing: managed.closing,
          });
          break;
        }
        packetCount += 1;
        if (result.value.type === "configuration") {
          console.info("scrcpy video configuration received", {
            scid: managed.scid,
            packetCount,
            bytes: result.value.data.byteLength,
          });
          managed.configuration = {
            ...result.value,
            data: result.value.data.slice(),
          };
          if (managed.publishVideo && this.#stream === managed) {
            this.#videoConfiguration = managed.configuration;
          }
        }
        if (managed.publishVideo && this.#stream === managed) {
          this.#publishPacket(result.value);
        }
      }
      if (!managed.closing && managed.publishVideo && this.#stream === managed) {
        this.#state = "error";
        this.#errorMessage = "The scrcpy video stream ended unexpectedly.";
        this.#closeVideoPort(this.#errorMessage);
      }
    } catch (error) {
      console.error("scrcpy video reader failed", {
        scid: managed.scid,
        packetCount,
        error: errorMessageOf(error),
      });
      if (!managed.closing && managed.publishVideo && this.#stream === managed) {
        this.#state = "error";
        this.#errorMessage = `scrcpy video failed: ${errorMessageOf(error)}`;
        this.#closeVideoPort(this.#errorMessage);
      }
    }
  }

  async #replaceStream(displayId: number): Promise<void> {
    if (this.#stream?.streamId !== undefined && this.#activeDisplayId === displayId) {
      return;
    }
    const previous = this.#stream;
    const previousDisplayId = this.#activeDisplayId;
    const targetOwner =
      this.#ownedVirtualDisplayId === displayId ? this.#displayOwner : null;
    this.#stream = null;
    this.#activeDisplayId = null;
    this.#videoConfiguration = null;
    this.#videoCodec = null;
    this.#audioConfiguration = null;
    this.#audioCodec = null;
    this.#videoWidth = 0;
    this.#videoHeight = 0;
    this.#closeVideoPort("The observed display changed.");
    if (previous !== null) {
      previous.publishVideo = false;
      if (previous !== this.#displayOwner) {
        await this.#closeManaged(previous);
      }
    }

    if (targetOwner !== null) {
      await this.#waitForVideoSize(targetOwner);
      this.#activateManaged(targetOwner, displayId);
      return;
    }

    let next: ManagedScrcpyClient | null = null;
    try {
      next = await this.#startClient(
        this.#createOptions({ displayId }),
        true,
      );
      await this.#waitForVideoSize(next);
      this.#activateManaged(next, displayId);
    } catch (error) {
      if (next !== null && this.#stream !== next) {
        await this.#closeManaged(next).catch(() => undefined);
      }
      if (previousDisplayId !== null) {
        try {
          if (
            previousDisplayId === this.#ownedVirtualDisplayId &&
            this.#displayOwner !== null
          ) {
            await this.#waitForVideoSize(this.#displayOwner);
            this.#activateManaged(this.#displayOwner, previousDisplayId);
          } else {
            const restored = await this.#startClient(
              this.#createOptions({ displayId: previousDisplayId }),
              true,
            );
            await this.#waitForVideoSize(restored);
            this.#activateManaged(restored, previousDisplayId);
          }
        } catch (rollbackError) {
          throw new Error(
            `${errorMessageOf(error)}; restoring display ${previousDisplayId} also failed: ${errorMessageOf(rollbackError)}`,
          );
        }
      }
      throw error;
    }
  }

  async #waitForVideoSize(managed: ManagedScrcpyClient): Promise<void> {
    for (let attempt = 0; attempt < Timing.VIDEO_SIZE_WAIT_ATTEMPTS; attempt += 1) {
      if (managed.width > 0 && managed.height > 0) {
        console.info("scrcpy video size available", {
          scid: managed.scid,
          width: managed.width,
          height: managed.height,
          waitedMs: attempt * Timing.VIDEO_SIZE_POLL_STEP_MS,
        });
        return;
      }
      if (managed.closing) {
        console.warn("scrcpy closed while waiting for video size", {
          scid: managed.scid,
          waitedMs: attempt * Timing.VIDEO_SIZE_POLL_STEP_MS,
        });
        throw new Error("scrcpy closed before reporting a video size");
      }
      if (attempt > 0 && attempt % 50 === 0) {
        console.debug("waiting for scrcpy video size", {
          scid: managed.scid,
          waitedMs: attempt * Timing.VIDEO_SIZE_POLL_STEP_MS,
          width: managed.width,
          height: managed.height,
        });
      }
      await delay(Timing.VIDEO_SIZE_POLL_STEP_MS);
    }
    console.error("scrcpy video size timeout", {
      scid: managed.scid,
      waitedMs: Timing.VIDEO_SIZE_WAIT_ATTEMPTS * Timing.VIDEO_SIZE_POLL_STEP_MS,
      width: managed.width,
      height: managed.height,
    });
    throw new Error("scrcpy did not report a video size within 3 seconds");
  }

  #activateManaged(managed: ManagedScrcpyClient, displayId: number): void {
    managed.publishVideo = true;
    this.#stream = managed;
    this.#activeDisplayId = displayId;
    this.#videoCodec = managed.codec;
    this.#videoConfiguration = managed.configuration;
    this.#audioCodec = managed.audioCodec;
    this.#audioConfiguration = managed.audioConfiguration;
    this.#videoWidth = managed.width;
    this.#videoHeight = managed.height;
    void managed.client.controller?.resetVideo().catch(() => undefined);
  }

  async #closeManaged(
    managed: ManagedScrcpyClient | null,
    adbOverride?: Adb,
  ): Promise<void> {
    if (managed === null || managed.closing) {
      return;
    }
    managed.closing = true;
    managed.removeSizeListener();
    await this.#releaseTouch(managed);
    await managed.reader.cancel().catch(() => undefined);
    await managed.client.controller?.close().catch(() => undefined);
    await managed.client.close().catch(() => undefined);
    const adb = adbOverride ?? this.#deviceSession.getConnection()?.adb;
    if (adb !== undefined) {
      for (const pid of await this.#findProcessIds(managed.scid, adb)) {
        await adb.subprocess.noneProtocol
          .spawnWait(["kill", pid])
          .catch(() => undefined);
      }
      await adb.subprocess.noneProtocol
        .spawnWait(["rm", "-f", managed.serverPath])
        .catch(() => undefined);
    }
    await Promise.race([
      Promise.all([
        managed.videoDone,
        managed.audioDone,
        managed.outputDone,
      ]).then(() => undefined),
      delay(Timing.STREAM_CLOSE_GRACE_MS),
    ]);
  }

  async #releaseTouch(managed: ManagedScrcpyClient): Promise<void> {
    const controller = managed.client.controller;
    if (!managed.touchActive || controller === undefined) {
      return;
    }
    managed.touchActive = false;
    await controller
      .injectTouch({
        action: AndroidMotionEventAction.Up,
        pointerId: ScrcpyPointerId.Finger,
        pointerX: managed.touchX * managed.width,
        pointerY: managed.touchY * managed.height,
        videoWidth: managed.width,
        videoHeight: managed.height,
        pressure: 0,
        actionButton: AndroidMotionEventButton.Primary,
        buttons: 0,
      })
      .catch(() => undefined);
  }

  async #findProcessIds(scid: string, adbOverride?: Adb): Promise<string[]> {
    const adb = adbOverride ?? this.#deviceSession.getConnection()?.adb;
    if (adb === undefined) {
      return [];
    }
    const script = [
      "for entry in /proc/[0-9]*/cmdline; do",
      '  [ -r "$entry" ] || continue',
      "  cmdline=\"$(tr '\\000' ' ' < \"$entry\" 2>/dev/null)\"",
      `  case " $cmdline " in *" com.genymobile.scrcpy.Server "*" scid=${scid} "*)`,
      '    pid="${entry#/proc/}"',
      '    echo "${pid%/cmdline}"',
      "  esac",
      "done",
    ].join("\n");
    try {
      const output = await adb.subprocess.noneProtocol.spawnWaitText([
        "sh",
        "-c",
        script,
      ]);
      return output
        .split(/\s+/)
        .filter((value) => /^\d+$/.test(value));
    } catch {
      return [];
    }
  }

  async #listDisplays(): Promise<AndroidDisplayDto[]> {
    const adb = this.#deviceSession.getConnection()?.adb;
    if (adb === undefined) {
      throw new Error("Android device is not connected");
    }
    let details: ReturnType<typeof parseDisplayDetails> = [];
    let displayIds: number[] = [];
    let virtualIds: number[] = [];
    try {
      const output = await adb.subprocess.noneProtocol.spawnWaitText([
        "dumpsys",
        "display",
      ]);
      details = parseDisplayDetails(output);
    } catch {
      // `cmd display` below remains authoritative when dumpsys is restricted.
    }
    try {
      const [allOutput, virtualOutput] = await Promise.all([
        adb.subprocess.noneProtocol.spawnWaitText([
          "cmd",
          "display",
          "get-displays",
          "--ids-only",
        ]),
        adb.subprocess.noneProtocol.spawnWaitText([
          "cmd",
          "display",
          "get-displays",
          "--ids-only",
          "--type",
          "virtual",
        ]),
      ]);
      displayIds = parseDisplayIds(allOutput);
      virtualIds = parseDisplayIds(virtualOutput);
    } catch {
      displayIds = details.map((display) => display.displayId);
      virtualIds = details
        .filter((display) => display.virtual)
        .map((display) => display.displayId);
    }
    return filterManageableDisplays(
      mergeDisplayCatalog(
        details,
        displayIds,
        new Set(virtualIds),
        this.#ownedVirtualDisplayId,
      ),
      this.#displayOwner !== null,
    );
  }

  async #waitForAddedDisplay(before: readonly AndroidDisplayDto[]): Promise<{
    displays: AndroidDisplayDto[];
    displayId?: number;
  }> {
    let displays = [...before];
    let candidate: number | undefined;
    let stableObservations = 0;
    for (let attempt = 0; attempt < Timing.VIRTUAL_DISPLAY_WAIT_ATTEMPTS; attempt += 1) {
      displays = await this.#listDisplays();
      const displayId = findAddedVirtualDisplayId(before, displays);
      if (displayId !== undefined) {
        if (displayId === candidate) {
          stableObservations += 1;
        } else {
          candidate = displayId;
          stableObservations = 1;
        }
        // Some devices briefly publish a placeholder ID while scrcpy finishes
        // configuring the virtual display. Require three consecutive catalog
        // reads before binding a monitor/control stream to the new ID.
        if (stableObservations >= Timing.VIRTUAL_DISPLAY_STABLE_COUNT) {
          return { displays, displayId };
        }
      } else {
        candidate = undefined;
        stableObservations = 0;
      }
      await delay(Timing.VIRTUAL_DISPLAY_POLL_MS);
    }
    return { displays };
  }

  #controller(): ScrcpyControlMessageWriter | null {
    return this.#stream?.client.controller ?? null;
  }

  #publishPacket(packet: ScrcpyMediaStreamPacket): void {
    const streamId = this.#stream?.streamId;
    const port = this.#videoPort;
    if (streamId === undefined || port === null) {
      return;
    }
    try {
      port.postMessage({
        type: "packet",
        streamId,
        packet: {
          ...packet,
          data: packet.data.slice(),
        },
      });
    } catch {
      if (this.#videoPort === port) {
        this.#videoPort = null;
      }
      port.close();
    }
  }

  #publishAudioPacket(packet: ScrcpyMediaStreamPacket): void {
    const streamId = this.#stream?.streamId;
    const port = this.#videoPort;
    if (streamId === undefined || port === null) {
      return;
    }
    try {
      port.postMessage({
        type: "audio-packet",
        streamId,
        packet: {
          ...packet,
          data: packet.data.slice(),
        },
      });
    } catch {
      if (this.#videoPort === port) {
        this.#videoPort = null;
      }
      port.close();
    }
  }

  #closeVideoPort(reason: string): void {
    const port = this.#videoPort;
    this.#videoPort = null;
    if (port === null) {
      return;
    }
    const streamId = this.#stream?.streamId;
    if (streamId !== undefined) {
      try {
        port.postMessage({ type: "stopped", streamId, reason });
      } catch {
        // A closed renderer port must not stop the main-process scrcpy stream.
      }
    }
    port.close();
  }

  #failure(code: ScreenFailureCode, message: string): ScreenOperationResult {
    this.#errorMessage = message;
    if (code !== "not-connected" && this.#state !== "streaming") {
      this.#state = "error";
    }
    return { status: "error", error: { code, message } };
  }

  #operationFailure(prefix: string, error: unknown): ScreenOperationResult {
    return this.#failure(
      "operation-failed",
      `${prefix}: ${errorMessageOf(error)}`,
    );
  }
}
