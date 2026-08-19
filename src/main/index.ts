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
import { DeviceSessionService } from "./adb/device-session";
import { TangoAdbGateway } from "./adb/tango-adb-gateway";

const rendererUrl = process.env["ELECTRON_RENDERER_URL"];

let persistence: PersistenceDatabase | null = null;
let deviceSession: DeviceSessionService | null = null;
let shuttingDown = false;

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
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });

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

  const store = openPersistence();
  registerProjectHandlers(store);

  const session = new DeviceSessionService(new TangoAdbGateway());
  deviceSession = session;
  registerDeviceHandlers(session);

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
    await deviceSession?.dispose();
  } catch (error) {
    console.error("Failed to dispose device session during shutdown", error);
  }
}

app.on("will-quit", () => {
  persistence?.close();
  persistence = null;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
