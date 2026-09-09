import type {
  CreateVirtualDisplayInput,
  ScreenOperationResult,
  ScreenSessionDto,
  ScrcpyConfiguredScope,
  ScrcpyOverrides,
  ScrcpySettings,
  ScrcpySettingsScope,
  ScrcpySettingsScopeView,
} from "../../shared/screen-contracts";
import type {
  OpenScreenInput,
  ScreenRef,
} from "../../shared/window-contracts";
import type { ProjectStore } from "../persistence/project-store";
import {
  ScrcpySettingsStore,
  type LoadedScrcpySettings,
} from "../persistence/scrcpy-settings-store";
import { resolveScrcpySettings } from "../../shared/scrcpy-scope-resolve";
import { DEFAULT_SCRCPY_SETTINGS } from "../../shared/screen-contracts";
import { AdbFlowActionDriver } from "../runtime/adb-flow-driver";
import { createAdbOcrRecognitionDriver } from "../runtime/adb-ocr-recognition";
import { RunRegistry } from "../runtime/run-registry";
import { FlowRuntimeService } from "../runtime/flow-runtime";
import { DeviceRegistryService } from "../devices/device-registry";
import type { DeviceSessionService } from "../adb/device-session";
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

const EMPTY_OVERRIDES: ScrcpyOverrides = {};

/**
 * Owns one scrcpy service and one flow runtime per screen instance. The
 * existing services remain deliberately small; this registry supplies their
 * stable scope and prevents one display from replacing another display's
 * stream.
 *
 * Scrcpy settings follow a three-layer scope model:
 *   global defaults -> per-device overrides -> per-screen overrides.
 * The registry resolves the effective settings whenever a screen session is
 * created and re-applies them to affected sessions when a layer changes.
 * Running streams are never restarted; the next stream uses the new values.
 */
export class ScreenRegistryService {
  readonly #devices: DeviceRegistryService;
  readonly #store: ProjectStore;
  readonly #settingsStore: ScrcpySettingsStore;
  readonly #userDataPath: string;
  readonly #contexts = new Map<string, ScreenContext>();
  readonly #runs = new RunRegistry();
  readonly #listeners = new Set<(snapshot: ScreenContextSnapshot) => void>();
  #globalSettings: ScrcpySettings = { ...DEFAULT_SCRCPY_SETTINGS };
  readonly #deviceOverrides = new Map<string, ScrcpyOverrides>();
  readonly #screenOverrides = new Map<string, Map<number, ScrcpyOverrides>>();
  #disposePromise: Promise<void> | null = null;

  constructor(
    devices: DeviceRegistryService,
    store: ProjectStore,
    settingsStore: ScrcpySettingsStore,
    userDataPath: string,
  ) {
    this.#devices = devices;
    this.#store = store;
    this.#settingsStore = settingsStore;
    this.#userDataPath = userDataPath;
    const loaded = settingsStore.load();
    this.#applyLoaded(loaded);
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
    probe.setSettings(this.#resolvedFor(session, null, false));
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
    service.setSettings(
      this.#resolvedFor(session, input.displayId, false),
    );
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
    // Virtual displays only inherit the global + device layers: their Android
    // display id is not known until the display has been created.
    service.setSettings(this.#resolvedFor(session, null, true));
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

  // -------------------------------------------------------------------------
  // Scoped settings
  // -------------------------------------------------------------------------

  getScopeView(scope: ScrcpySettingsScope): ScrcpySettingsScopeView {
    if (scope.scope === "global") {
      return {
        scope,
        overrides: { ...EMPTY_OVERRIDES },
        resolved: { ...this.#globalSettings },
      };
    }
    if (scope.scope === "device") {
      return {
        scope,
        overrides: {
          ...(this.#deviceOverrides.get(scope.deviceKey) ?? EMPTY_OVERRIDES),
        },
        resolved: this.#resolveLayers(scope.deviceKey, null, false),
      };
    }
    return {
      scope,
      overrides: {
        ...(this.#screenOverrides.get(scope.deviceKey)?.get(scope.displayId) ??
          EMPTY_OVERRIDES),
      },
      resolved: this.#resolveLayers(scope.deviceKey, scope.displayId, false),
    };
  }

  getGlobalSettings(): ScrcpySettings {
    return { ...this.#globalSettings };
  }

  setGlobalSettings(settings: ScrcpySettings): ScrcpySettingsScopeView {
    this.#globalSettings = { ...settings };
    this.#settingsStore.saveGlobal(this.#globalSettings);
    this.#recomputeContexts();
    return this.getScopeView({ scope: "global" });
  }

  setDeviceOverrides(
    deviceKey: string,
    overrides: ScrcpyOverrides,
  ): ScrcpySettingsScopeView {
    if (Object.keys(overrides).length === 0) {
      this.#deviceOverrides.delete(deviceKey);
    } else {
      this.#deviceOverrides.set(deviceKey, { ...overrides });
    }
    this.#settingsStore.saveDeviceOverrides(deviceKey, overrides);
    this.#recomputeContexts(deviceKey);
    return this.getScopeView({ scope: "device", deviceKey });
  }

  setScreenOverrides(
    deviceKey: string,
    displayId: number,
    overrides: ScrcpyOverrides,
  ): ScrcpySettingsScopeView {
    const byDisplay =
      this.#screenOverrides.get(deviceKey) ??
      new Map<number, ScrcpyOverrides>();
    if (Object.keys(overrides).length === 0) {
      byDisplay.delete(displayId);
      if (byDisplay.size === 0) {
        this.#screenOverrides.delete(deviceKey);
      } else {
        this.#screenOverrides.set(deviceKey, byDisplay);
      }
    } else {
      byDisplay.set(displayId, { ...overrides });
      this.#screenOverrides.set(deviceKey, byDisplay);
    }
    this.#settingsStore.saveScreenOverrides(deviceKey, displayId, overrides);
    this.#recomputeContexts(deviceKey, displayId);
    return this.getScopeView({ scope: "screen", deviceKey, displayId });
  }

  deleteScope(scope: ScrcpySettingsScope): void {
    if (scope.scope === "global") {
      // Global defaults cannot be deleted; deleting resets them.
      this.setGlobalSettings({ ...this.#globalSettings });
      return;
    }
    if (scope.scope === "device") {
      this.#deviceOverrides.delete(scope.deviceKey);
    } else {
      const byDisplay = this.#screenOverrides.get(scope.deviceKey);
      if (byDisplay !== undefined) {
        byDisplay.delete(scope.displayId);
        if (byDisplay.size === 0) {
          this.#screenOverrides.delete(scope.deviceKey);
        }
      }
    }
    this.#settingsStore.deleteScope(scope);
    this.#recomputeContexts(
      scope.deviceKey,
      scope.scope === "screen" ? scope.displayId : null,
    );
  }

  listConfiguredScopes(): ScrcpyConfiguredScope[] {
    const scopes: ScrcpyConfiguredScope[] = [];
    for (const deviceKey of this.#deviceOverrides.keys()) {
      scopes.push({ scope: "device", deviceKey });
    }
    for (const [deviceKey, byDisplay] of this.#screenOverrides) {
      for (const displayId of byDisplay.keys()) {
        scopes.push({ scope: "screen", deviceKey, displayId });
      }
    }
    scopes.sort((left, right) => {
      const byDevice = left.deviceKey.localeCompare(right.deviceKey);
      if (byDevice !== 0) {
        return byDevice;
      }
      const leftDisplay = left.scope === "screen" ? left.displayId : -1;
      const rightDisplay = right.scope === "screen" ? right.displayId : -1;
      return leftDisplay - rightDisplay;
    });
    return scopes;
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

  #applyLoaded(loaded: LoadedScrcpySettings): void {
    this.#globalSettings = { ...loaded.global };
    for (const [deviceKey, overrides] of loaded.deviceOverrides) {
      this.#deviceOverrides.set(deviceKey, { ...overrides });
    }
    for (const [deviceKey, byDisplay] of loaded.screenOverrides) {
      this.#screenOverrides.set(
        deviceKey,
        new Map([...byDisplay].map(([displayId, overrides]) => [
          displayId,
          { ...overrides },
        ])),
      );
    }
  }

  /**
   * Effective settings a newly created screen service should use for a target.
   * Screen-layer overrides only apply to physical displays (`virtual` false
   * and a known display id).
   */
  #resolvedFor(
    session: DeviceSessionService | null,
    displayId: number | null,
    virtual: boolean,
  ): ScrcpySettings {
    const serial = session?.getConnection()?.serial ?? null;
    return this.#resolveLayers(serial, displayId, virtual);
  }

  #resolveLayers(
    deviceKey: string | null,
    displayId: number | null,
    virtual: boolean,
  ): ScrcpySettings {
    const deviceOverrides =
      deviceKey === null ? undefined : this.#deviceOverrides.get(deviceKey);
    const screenOverrides =
      deviceKey === null || displayId === null || virtual
        ? undefined
        : this.#screenOverrides.get(deviceKey)?.get(displayId);
    return resolveScrcpySettings(
      this.#globalSettings,
      deviceOverrides,
      screenOverrides,
    );
  }

  /** Re-applies resolved settings to the sessions affected by a scope change. */
  #recomputeContexts(deviceKey?: string, displayId?: number | null): void {
    for (const { ref, service } of this.#contexts.values()) {
      const session = this.#devices.getSessionService(ref.sessionId);
      const serial = session?.getConnection()?.serial ?? null;
      if (deviceKey !== undefined && serial !== deviceKey) {
        continue;
      }
      if (
        displayId !== undefined &&
        displayId !== null &&
        ref.displayId !== displayId
      ) {
        continue;
      }
      const virtual = this.#isVirtualDisplay(service, ref.displayId);
      service.setSettings(this.#resolveLayers(serial, ref.displayId, virtual));
    }
  }

  #isVirtualDisplay(service: ScreenSessionService, displayId: number): boolean {
    const snapshot = service.getSnapshot();
    if (snapshot.ownedVirtualDisplayIds.includes(displayId)) {
      return true;
    }
    return snapshot.displays.some(
      (display) => display.displayId === displayId && display.kind === "virtual",
    );
  }
}
