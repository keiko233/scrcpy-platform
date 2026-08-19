import { contextBridge, ipcRenderer } from "electron";
import {
  ELECTRON_CHANNELS,
  type ElectronAPI,
} from "../shared/electron-api";

const api: ElectronAPI = {
  getSystemInfo: () => ipcRenderer.invoke(ELECTRON_CHANNELS.systemInfo),
};

contextBridge.exposeInMainWorld("androidPlatform", Object.freeze(api));
