import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import {
  ELECTRON_CHANNELS,
  type SystemInfo,
  type SystemPlatform,
} from "../shared/electron-api";

const rendererUrl = process.env["ELECTRON_RENDERER_URL"];

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

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
