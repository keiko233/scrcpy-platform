import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { join } from "node:path";

import {
  ELECTRON_CHANNELS,
  type SystemInfo,
  type SystemPlatform,
} from "../shared/electron-api";
import { ScreenRefSchema } from "../shared/window-contracts";
import { PersistenceDatabase } from "./persistence/database";
import { ProjectStore } from "./persistence/project-store";
import { ScrcpySettingsStore } from "./persistence/scrcpy-settings-store";
import { AppPreferencesStore } from "./persistence/app-preferences-store";
import { AppLocaleSchema } from "../shared/locale-contracts";
import { registerProjectHandlers } from "./ipc/project-handlers";
import { registerDeviceHandlers } from "./ipc/device-handlers";
import { registerScreenHandlers } from "./ipc/screen-handlers";
import { registerRunHandlers } from "./ipc/run-handlers";
import { ensureAdbServer } from "./adb/adb-server";
import { TangoAdbGateway } from "./adb/tango-adb-gateway";
import { Logger } from "./logging/logger";
import { DeviceRegistryService } from "./devices/device-registry";
import { ScreenRegistryService } from "./screens/screen-registry";
import { WindowContextRegistry } from "./windows/window-context-registry";
import { WindowManager } from "./windows/window-manager";

const rendererUrl = process.env["ELECTRON_RENDERER_URL"];

let persistence: PersistenceDatabase | null = null;
let devices: DeviceRegistryService | null = null;
let screens: ScreenRegistryService | null = null;
let logger: Logger | null = null;
let windows: WindowManager | null = null;
let removeDeviceHandlers: (() => void) | null = null;
let removeScreenHandlers: (() => void) | null = null;
let removeRunHandlers: (() => void) | null = null;
let removeBackgroundRunCleanup: (() => void) | null = null;
let shuttingDown = false;

function openPersistence(): {
  store: ProjectStore;
  settingsStore: ScrcpySettingsStore;
  preferencesStore: AppPreferencesStore;
} {
  const dbPath = join(app.getPath("userData"), "android-platform.sqlite3");
  persistence = new PersistenceDatabase(dbPath);
  return {
    store: new ProjectStore(persistence),
    settingsStore: new ScrcpySettingsStore(persistence),
    preferencesStore: new AppPreferencesStore(persistence),
  };
}

function getSystemInfo(): SystemInfo {
  const versions = process.versions;
  return {
    runtime: "electron",
    platform: getSystemPlatform(),
    versions: {
      electron: versions.electron ?? "unknown",
      chrome: versions.chrome ?? "unknown",
      node: versions.node ?? "unknown",
    },
  };
}

function getSystemPlatform(): SystemPlatform {
  if (process.platform === "darwin" || process.platform === "win32") {
    return process.platform;
  }
  return "unsupported";
}

function closeScreenAfterWindow(contextId: string): void {
  void screens?.close(contextId);
}

void app.whenReady().then(async () => {
  const contexts = new WindowContextRegistry();
  const { store, settingsStore, preferencesStore } = openPersistence();
  logger = new Logger(join(app.getPath("userData"), "android-platform.log"));
  logger.install();

  ipcMain.handle(ELECTRON_CHANNELS.systemInfo, () => getSystemInfo());
  ipcMain.handle(ELECTRON_CHANNELS.localeGet, () => preferencesStore.getLocale());
  ipcMain.handle(ELECTRON_CHANNELS.localeSet, (_event, raw: unknown) => {
    const locale = AppLocaleSchema.parse(raw);
    const saved = preferencesStore.setLocale(locale);
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.send(ELECTRON_CHANNELS.localeChanged, saved);
      }
    }
    return saved;
  });
  ipcMain.handle(ELECTRON_CHANNELS.windowContext, (event) => {
    const context = contexts.get(event.sender.id);
    if (context === null) {
      throw new Error("The renderer window has no registered context.");
    }
    return { context };
  });
  ipcMain.handle(ELECTRON_CHANNELS.windowMinimize, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.handle(ELECTRON_CHANNELS.windowToggleMaximize, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window === null) {
      return;
    }
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  });
  ipcMain.handle(ELECTRON_CHANNELS.windowClose, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  ipcMain.handle(ELECTRON_CHANNELS.windowIsMaximized, (event) =>
    BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false,
  );

  try {
    const { executable } = await ensureAdbServer();
    console.info("ADB server is ready", { executable });
  } catch (error) {
    console.error("Failed to start ADB server", error);
  }

  ipcMain.handle(ELECTRON_CHANNELS.logsList, (_event, input?: { limit?: number }) =>
    logger?.list(input?.limit),
  );
  ipcMain.handle(ELECTRON_CHANNELS.logsClear, () => {
    logger?.clear();
  });

  const gateway = new TangoAdbGateway();
  const deviceRegistry = new DeviceRegistryService(gateway, app.getPath("userData"));
  devices = deviceRegistry;
  const screenRegistry = new ScreenRegistryService(
    deviceRegistry,
    store,
    settingsStore,
    app.getPath("userData"),
  );
  screens = screenRegistry;

  const contextRegistry = contexts;
  const windowManager = new WindowManager(contextRegistry, {
    rendererUrl,
    preloadPath: join(import.meta.dirname, "../preload/index.cjs"),
    rendererPath: join(import.meta.dirname, "../renderer"),
    onBeforeClose: async (_window, context) => {
      if (context.kind !== "screen") {
        return true;
      }
      const run = screenRegistry.runRegistry.getRun(
        context.target.screenInstanceId,
      );
      if (run?.state !== "running" && run?.state !== "paused") {
        return true;
      }

      const choice = await dialog.showMessageBox({
        type: "question",
        title: "关闭屏幕窗口",
        message: "此屏幕仍有运行中的脚本。",
        detail: "可以让脚本在后台继续，或先停止脚本再关闭窗口。",
        buttons: ["后台继续", "停止并关闭", "取消"],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      });
      if (choice.response === 0) {
        return true;
      }
      if (choice.response !== 1) {
        return false;
      }

      const stopped = await screenRegistry.runRegistry.stop(
        context.target.screenInstanceId,
        { runId: run.runId },
      );
      return stopped.status === "ok";
    },
    onClosed: (context) => {
      if (context.kind === "screen") {
        closeScreenAfterWindow(context.target.screenInstanceId);
      }
    },
  });
  windows = windowManager;

  registerProjectHandlers(store);
  removeDeviceHandlers = registerDeviceHandlers(deviceRegistry, contextRegistry);
  removeScreenHandlers = registerScreenHandlers(
    screenRegistry,
    deviceRegistry,
    contextRegistry,
    windowManager,
  );
  removeRunHandlers = registerRunHandlers(
    screenRegistry.runRegistry,
    deviceRegistry,
    contextRegistry,
  );
  removeBackgroundRunCleanup = screenRegistry.runRegistry.subscribe(
    (screenInstanceId, run) => {
      if (run.state !== "running" && run.state !== "paused") {
        if (windowManager.getScreenWindow(screenInstanceId) === null) {
          void screenRegistry.close(screenInstanceId);
        }
      }
    },
  );

  ipcMain.handle(ELECTRON_CHANNELS.windowOpenManager, () => {
    windowManager.openManager();
  });
  ipcMain.handle(ELECTRON_CHANNELS.windowOpenPair, () => {
    windowManager.openPair();
  });
  ipcMain.handle(ELECTRON_CHANNELS.windowOpenSettings, () => {
    windowManager.openSettings();
  });
  ipcMain.handle(ELECTRON_CHANNELS.windowOpenScreen, (_event, raw: unknown) => {
    const ref = ScreenRefSchema.parse(raw);
    windowManager.openScreen(ref);
  });

  windowManager.openManager();

  app.on("activate", () => {
    windowManager.openManager();
  });
});

app.on("before-quit", (event) => {
  if (shuttingDown) {
    return;
  }
  event.preventDefault();
  shuttingDown = true;
  void (async () => {
    await screens?.dispose();
    await devices?.dispose();
    app.quit();
  })();
});

app.on("will-quit", () => {
  removeRunHandlers?.();
  removeBackgroundRunCleanup?.();
  removeScreenHandlers?.();
  removeDeviceHandlers?.();
  removeRunHandlers = null;
  removeBackgroundRunCleanup = null;
  removeScreenHandlers = null;
  removeDeviceHandlers = null;
  logger?.dispose();
  logger = null;
  persistence?.close();
  persistence = null;
  screens = null;
  devices = null;
  windows = null;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (screens?.runRegistry !== undefined) {
      // Keep a manager entry point while screen-scoped runs are still alive.
      const activeRun = screens.listContexts().some(({ ref }) => {
        const run = screens?.runRegistry.getRun(ref.screenInstanceId);
        return run?.state === "running" || run?.state === "paused";
      });
      if (activeRun) {
        windows?.openManager();
        return;
      }
    }
    app.quit();
  }
});
