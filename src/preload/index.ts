import { contextBridge, ipcRenderer } from "electron";
import {
  ELECTRON_CHANNELS,
  SCREEN_VIDEO_WINDOW_EVENT,
  type ElectronAPI,
} from "../shared/electron-api";

const api: ElectronAPI = {
  getSystemInfo: () => ipcRenderer.invoke(ELECTRON_CHANNELS.systemInfo),
  listLogs: (input) => ipcRenderer.invoke(ELECTRON_CHANNELS.logsList, input),
  clearLogs: () => ipcRenderer.invoke(ELECTRON_CHANNELS.logsClear),
  onLog: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, entry: Parameters<typeof listener>[0]) =>
      listener(entry);
    ipcRenderer.on(ELECTRON_CHANNELS.logsEntry, handler);
    return () => ipcRenderer.removeListener(ELECTRON_CHANNELS.logsEntry, handler);
  },

  listProjects: () => ipcRenderer.invoke(ELECTRON_CHANNELS.projectsList),
  createProject: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.projectsCreate, input),

  listScripts: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.scriptsList, input),
  createScript: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.scriptsCreate, input),
  getScript: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.scriptsGet, input),
  saveScriptDraft: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.scriptsSaveDraft, input),

  createRevision: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.revisionsCreate, input),
  listRevisions: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.revisionsList, input),
  restoreRevision: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.revisionsRestore, input),

  listDevices: () => ipcRenderer.invoke(ELECTRON_CHANNELS.devicesList),
  getDeviceSession: () =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.devicesSession),
  connectDevice: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.devicesConnect, input),
  disconnectDevice: () =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.devicesDisconnect),
  listInstalledApps: () =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.devicesPackages),

  getScreenSession: () =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.screensSession),
  getScrcpySettings: () =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.screensSettingsGet),
  setScrcpySettings: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.screensSettingsSet, input),
  refreshScreens: () =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.screensRefresh),
  startScreen: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.screensStart, input),
  createVirtualScreen: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.screensCreateVirtual, input),
  destroyVirtualScreen: () =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.screensDestroyVirtual),
  pressDeviceButton: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.screensPressButton, input),
  injectScreenTouch: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.screensInjectTouch, input),
  requestScreenVideo: (input) =>
    ipcRenderer.send(ELECTRON_CHANNELS.screensRequestVideo, input),
};

ipcRenderer.on(ELECTRON_CHANNELS.screensVideoPort, (event, payload) => {
  window.postMessage(
    { type: SCREEN_VIDEO_WINDOW_EVENT, ...payload },
    "*",
    event.ports,
  );
});

contextBridge.exposeInMainWorld("androidPlatform", Object.freeze(api));
