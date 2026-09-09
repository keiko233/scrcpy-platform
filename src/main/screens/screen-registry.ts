import type {
  CreateVirtualDisplayInput,
  ScreenOperationResult,
  ScreenSessionDto,
  ScrcpySettings,
} from "../../shared/screen-contracts";
import type {
  OpenScreenInput,
  ScreenRef,
} from "../../shared/window-contracts";
import type { ProjectStore } from "../persistence/project-store";
import { AdbFlowActionDriver } from "../runtime/adb-flow-driver";
import { createAdbOcrRecognitionDriver } from "../runtime/adb-ocr-recognition";
import { RunRegistry } from "../runtime/run-registry";
import { FlowRuntimeService } from "../runtime/flow-runtime";
import { DeviceRegistryService } from "../devices/device-registry";
import { ScreenSessionService } from "../adb/screen-session";

export interface ScreenContextSnapshot {
  ref: ScreenRef;
  screen: ScreenSessionDto;
}

interface ScreenContext {
  ref: ScreenRef;
  service: ScreenSessionService;
  runtime: FlowRuntimeService;
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function operationError(message: string): ScreenOperationResult {
  return {
    status: "error",
    error: { code: "operation-failed", message },
  };
}

/**
 * Owns one scrcpy service and one flow runtime per screen instance. The
 * existing services remain deliberately small; this registry supplies their
 * stable scope and prevents one display from replacing another display's
 * stream.
 */
export class ScreenRegistryService {
  readonly #devices: DeviceRegistryService;
  readonly #store: ProjectStore;
  readonly #userDataPath: string;
  readonly #contexts = new Map<string, ScreenContext>();
  readonly #runs = new RunRegistry();
  readonly #listeners = new Set<(snapshot: ScreenContextSnapshot) => void>();
  #settings: ScrcpySettings;
  #disposePromise: Promise<void> | null = null;

  constructor(
    devices: DeviceRegistryService,
    store: ProjectStore,
    userDataPath: string,
    settings: ScrcpySettings,
  ) {
    this.#devices = devices;
    this.#store = store;
    this.#userDataPath = userDataPath;
    this.#settings = { ...settings };
  }

  get runRegistry(): RunRegistry {
    return this.#runs;
  }

  subscribe(listener: (snapshot: ScreenContextSnapshot) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  getContext(screenInstanceId: string): ScreenContextSnapshot | null {
    const context = this.#contexts.get(screenInstanceId);
    return context === undefined ? null : this.#snapshot(context);
  }

  getContextByRef(ref: ScreenRef): ScreenContext | null {
    const context = this.#contexts.get(ref.screenInstanceId) ?? null;
    if (
      context === null ||
      context.ref.sessionId !== ref.sessionId ||
      context.ref.displayId !== ref.displayId
    ) {
      return null;
    }
    return context;
  }

  getContextForDisplay(sessionId: string, displayId: number): ScreenContext | null {
    for (const context of this.#contexts.values()) {
      if (
        context.ref.sessionId === sessionId &&
        context.ref.displayId === displayId
      ) {
        return context;
      }
    }
    return null;
  }

  listContexts(): ScreenContextSnapshot[] {
    return [...this.#contexts.values()].map((context) => this.#snapshot(context));
  }

  async listDisplays(sessionId: string): Promise<ScreenOperationResult> {
    const existing = this.#firstContextForSession(sessionId);
    if (existing !== null) {
      const result = await existing.service.refreshDisplays();
      this.#notify(existing);
      return result;
    }
    const session = this.#devices.getSessionService(sessionId);
    if (session === null || session.getConnection() === null) {
      return operationError("The requested Android device session is no longer connected.");
    }
    const probe = new ScreenSessionService(session);
    probe.setSettings(this.#settings);
    try {
      return await probe.refreshDisplays();
    } finally {
      await probe.dispose().catch(() => undefined);
    }
  }

  async openScreen(input: OpenScreenInput): Promise<
    | { status: "ok"; ref: ScreenRef; screen: ScreenSessionDto; reused: boolean }
    | { status: "error"; message: string }
  > {
    const existing = this.getContextForDisplay(input.sessionId, input.displayId);
    if (existing !== null) {
      return {
        status: "ok",
        ref: existing.ref,
        screen: existing.service.getSnapshot(),
        reused: true,
      };
    }
    const session = this.#devices.getSessionService(input.sessionId);
    if (session === null || session.getConnection() === null) {
      return {
        status: "error",
        message: "The requested Android device session is no longer connected.",
      };
    }
    const service = new ScreenSessionService(session);
    service.setSettings(this.#settings);
    const started = await service.startDisplay(input.displayId);
    if (started.status === "error") {
      await service.dispose().catch(() => undefined);
      return { status: "error", message: started.error.message };
    }
    const ref: ScreenRef = {
      sessionId: input.sessionId,
      screenInstanceId: `screen-${crypto.randomUUID()}`,
      displayId: input.displayId,
    };
    let context: ScreenContext;
    try {
      context = this.#createContext(ref, service);
    } catch (error) {
      await service.dispose().catch(() => undefined);
      return { status: "error", message: errorMessageOf(error) };
    }
    this.#notify(context);
    return {
      status: "ok",
      ref,
      screen: started.screen,
      reused: false,
    };
  }

  async createVirtualDisplay(
    sessionId: string,
    input: CreateVirtualDisplayInput,
  ): Promise<ScreenOperationResult> {
    const session = this.#devices.getSessionService(sessionId);
    if (session === null || session.getConnection() === null) {
      return operationError("The requested Android device session is no longer connected.");
    }
    const service = new ScreenSessionService(session);
    service.setSettings(this.#settings);
    const result = await service.createVirtualDisplay(input);
    if (result.status === "error") {
      await service.dispose().catch(() => undefined);
      return result;
    }
    const displayId = result.screen.activeDisplayId;
    if (displayId === null) {
      await service.dispose().catch(() => undefined);
      return operationError("The virtual display was created without a display ID.");
    }
    const ref: ScreenRef = {
      sessionId,
      screenInstanceId: `screen-${crypto.randomUUID()}`,
      displayId,
    };
    let context: ScreenContext;
    try {
      context = this.#createContext(ref, service);
    } catch (error) {
      await service.dispose().catch(() => undefined);
      return operationError(errorMessageOf(error));
    }
    this.#notify(context);
    return result;
  }

  async refresh(ref: ScreenRef): Promise<ScreenOperationResult> {
    const context = this.getContextByRef(ref);
    if (context === null) {
      return operationError("The screen session is stale or no longer exists.");
    }
    const result = await context.service.refreshDisplays();
    this.#notify(context);
    return result;
  }

  async start(ref: ScreenRef): Promise<ScreenOperationResult> {
    const context = this.getContextByRef(ref);
    if (context === null) {
      return operationError("The screen session is stale or no longer exists.");
    }
    const result = await context.service.startDisplay(ref.displayId);
    this.#notify(context);
    return result;
  }

  async destroyVirtualDisplay(
    sessionId: string,
    displayId: number,
  ): Promise<ScreenOperationResult> {
    const context = this.getContextForDisplay(sessionId, displayId);
    if (context === null) {
      return {
        status: "error",
        error: {
          code: "display-not-found",
          message: `Android display ${displayId} is not owned by an active screen session.`,
        },
      };
    }
    const result = await context.service.destroyVirtualDisplay(displayId);
    this.#notify(context);
    if (result.status === "ok" && result.screen.ownedVirtualDisplayIds.length === 0) {
      await this.close(context.ref.screenInstanceId);
    }
    return result;
  }

  getSettings(ref?: ScreenRef): ScrcpySettings {
    const context = ref === undefined ? null : this.getContextByRef(ref);
    return context?.service.getSettings() ?? { ...this.#settings };
  }

  setSettings(settings: ScrcpySettings, ref?: ScreenRef): ScrcpySettings {
    if (ref !== undefined) {
      const context = this.getContextByRef(ref);
      if (context !== null) {
        context.service.setSettings(settings);
        this.#notify(context);
        return context.service.getSettings();
      }
    }
    this.#settings = { ...settings };
    for (const context of this.#contexts.values()) {
      context.service.setSettings(settings);
      this.#notify(context);
    }
    return { ...this.#settings };
  }

  attachVideoPort(ref: ScreenRef, streamId: string, port: Parameters<ScreenSessionService["attachVideoPort"]>[1]): boolean {
    const context = this.getContextByRef(ref);
    if (context === null || context.service.getSnapshot().streamId !== streamId) {
      port.close();
      return false;
    }
    context.service.attachVideoPort(streamId, port);
    return true;
  }

  handleVideoCaptureResponse(ref: ScreenRef, raw: unknown): void {
    this.getContextByRef(ref)?.service.handleVideoCaptureResponse(raw);
  }

  async close(screenInstanceId: string, force = false): Promise<void> {
    const context = this.#contexts.get(screenInstanceId);
    if (context === undefined) {
      return;
    }
    const run = context.runtime.getRun();
    if (!force && (run?.state === "running" || run?.state === "paused")) {
      return;
    }
    this.#contexts.delete(screenInstanceId);
    this.#runs.unregister(screenInstanceId);
    await Promise.allSettled([
      context.runtime.dispose(),
      context.service.dispose(),
    ]);
  }

  async dispose(): Promise<void> {
    this.#disposePromise ??= this.#disposeOnce();
    return await this.#disposePromise;
  }

  #createContext(ref: ScreenRef, service: ScreenSessionService): ScreenContext {
    const session = this.#devices.getSessionService(ref.sessionId);
    if (session === null) {
      throw new Error("Cannot create a screen context without a device session.");
    }
    const runtime = new FlowRuntimeService(
      this.#store,
      new AdbFlowActionDriver(session),
      {
        recognition: createAdbOcrRecognitionDriver(
          session,
          service,
          this.#userDataPath,
        ),
      },
    );
    const context = { ref, service, runtime } satisfies ScreenContext;
    this.#contexts.set(ref.screenInstanceId, context);
    this.#runs.register(ref, runtime);
    return context;
  }

  async #disposeOnce(): Promise<void> {
    const ids = [...this.#contexts.keys()];
    await Promise.allSettled(ids.map((id) => this.close(id, true)));
    await this.#runs.dispose();
  }

  #firstContextForSession(sessionId: string): ScreenContext | null {
    for (const context of this.#contexts.values()) {
      if (context.ref.sessionId === sessionId) {
        return context;
      }
    }
    return null;
  }

  #snapshot(context: ScreenContext): ScreenContextSnapshot {
    return {
      ref: { ...context.ref },
      screen: context.service.getSnapshot(),
    };
  }

  #notify(context: ScreenContext): void {
    const snapshot = this.#snapshot(context);
    for (const listener of this.#listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        console.error("screen registry listener failed", errorMessageOf(error));
      }
    }
  }
}
