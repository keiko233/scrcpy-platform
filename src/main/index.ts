import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import {
  ELECTRON_CHANNELS,
  type SystemInfo,
  type SystemPlatform,
} from "../shared/electron-api";
import { PersistenceDatabase } from "./persistence/database";
import { ProjectStore } from "./persistence/project-store";
import { registerProjectHandlers } from "./ipc/project-handlers";
import { registerDeviceHandlers } from "./ipc/device-handlers";
import { registerScreenHandlers } from "./ipc/screen-handlers";
import { registerRunHandlers } from "./ipc/run-handlers";
import { DeviceSessionService } from "./adb/device-session";
import { ScreenSessionService } from "./adb/screen-session";
import { TangoAdbGateway } from "./adb/tango-adb-gateway";
import { Logger } from "./logging/logger";
import { AdbFlowActionDriver } from "./runtime/adb-flow-driver";
import { createAdbOcrRecognitionDriver } from "./runtime/adb-ocr-recognition";
import { FlowRuntimeService } from "./runtime/flow-runtime";

const rendererUrl = process.env["ELECTRON_RENDERER_URL"];

let persistence: PersistenceDatabase | null = null;
let deviceSession: DeviceSessionService | null = null;
let screenSession: ScreenSessionService | null = null;
let flowRuntime: FlowRuntimeService | null = null;
let shuttingDown = false;
let logger: Logger | null = null;

function openPersistence(): ProjectStore {
  const dbPath = join(app.getPath("userData"), "android-platform.sqlite3");
  persistence = new PersistenceDatabase(dbPath);
  return new ProjectStore(persistence);
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    title: "Android Platform",
    ...(process.platform === "darwin"
      ? { titleBarStyle: "hiddenInset" as const }
      : { frame: false }),
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      devTools: Boolean(rendererUrl),
    },
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  win.on("maximize", () => {
    win.webContents.send(ELECTRON_CHANNELS.windowMaximizedChanged, true);
  });
  win.on("unmaximize", () => {
    win.webContents.send(ELECTRON_CHANNELS.windowMaximizedChanged, false);
  });

  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("console-message", (details) => {
    const logLevel =
      details.level === "error"
        ? "error"
        : details.level === "warning"
          ? "warn"
          : details.level === "info"
            ? "info"
            : "debug";
    logger?.captureRenderer(
      logLevel,
      [details.message],
      `${details.sourceId}:${details.lineNumber}`,
    );
  });
  win.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });

  if (rendererUrl) {
    win.webContents.on("before-input-event", (event, input) => {
      if (
        input.type === "keyDown" &&
        input.key === "F12" &&
        !input.isAutoRepeat
      ) {
        event.preventDefault();
        win.webContents.toggleDevTools();
      }
    });
  }

  if (rendererUrl) {
    void win.loadURL(rendererUrl);
  } else {
    void win.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  }
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

void app.whenReady().then(() => {
  ipcMain.handle(ELECTRON_CHANNELS.systemInfo, () => getSystemInfo());

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
  ipcMain.handle(ELECTRON_CHANNELS.windowIsMaximized, (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
  });

  const store = openPersistence();
  logger = new Logger(join(app.getPath("userData"), "android-platform.log"));
  logger.install();
  ipcMain.handle(ELECTRON_CHANNELS.logsList, (_event, input?: { limit?: number }) =>
    logger?.list(input?.limit),
  );
  ipcMain.handle(ELECTRON_CHANNELS.logsClear, () => {
    logger?.clear();
  });
  registerProjectHandlers(store);

  const session = new DeviceSessionService(
    new TangoAdbGateway(),
    undefined,
    app.getPath("userData"),
  );
  deviceSession = session;
  registerDeviceHandlers(session);
  const screens = new ScreenSessionService(session);
  screenSession = screens;
  registerScreenHandlers(screens);
  const runtime = new FlowRuntimeService(store, new AdbFlowActionDriver(session), {
    recognition: createAdbOcrRecognitionDriver(session, app.getPath("userData")),
  });
  flowRuntime = runtime;
  registerRunHandlers(runtime);
  session.registerBeforeDisconnect(() => runtime.cancelCurrent());

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", (event) => {
  if (shuttingDown) {
    return;
  }
  event.preventDefault();
  shuttingDown = true;
  void shutdownDeviceSession().finally(() => {
    app.quit();
  });
});

async function shutdownDeviceSession(): Promise<void> {
  try {
    await flowRuntime?.dispose();
    await screenSession?.dispose();
    await deviceSession?.dispose();
  } catch (error) {
    console.error("Failed to dispose device session during shutdown", error);
  }
}

app.on("will-quit", () => {
  logger?.dispose();
  logger = null;
  persistence?.close();
  persistence = null;
  flowRuntime = null;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
