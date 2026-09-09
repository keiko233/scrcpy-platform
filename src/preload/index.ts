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
  renameProject: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.projectsRename, input),
  deleteProject: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.projectsDelete, input),

  listScripts: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.scriptsList, input),
  createScript: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.scriptsCreate, input),
  getScript: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.scriptsGet, input),
  renameScript: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.scriptsRename, input),
  deleteScript: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.scriptsDelete, input),
  saveScriptDraft: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.scriptsSaveDraft, input),

  createRevision: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.revisionsCreate, input),
  listRevisions: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.revisionsList, input),
  restoreRevision: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.revisionsRestore, input),

  listDevices: () => ipcRenderer.invoke(ELECTRON_CHANNELS.devicesList),
  listDeviceSessions: () =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.devicesSessions),
  getDeviceSession: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.devicesSession, input),
  onDeviceSession: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      session: Parameters<typeof listener>[0],
    ) => listener(session);
    ipcRenderer.on(ELECTRON_CHANNELS.devicesSessionChanged, handler);
    return () =>
      ipcRenderer.removeListener(ELECTRON_CHANNELS.devicesSessionChanged, handler);
  },
  connectDevice: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.devicesConnect, input),
  disconnectDevice: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.devicesDisconnect, input),
  pairWirelessDevice: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.devicesWirelessPair, input),
  connectWirelessDevice: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.devicesWirelessConnect, input),
  disconnectWirelessDevice: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.devicesWirelessDisconnect, input),
  listInstalledApps: () =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.devicesPackages),
  enrichInstalledApps: (packages) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.devicesPackagesEnrich, { packages }),

  getScreenSession: () =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.screensSession),
  onScreenSession: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      screen: Parameters<typeof listener>[0],
    ) => listener(screen);
    ipcRenderer.on(ELECTRON_CHANNELS.screensSessionChanged, handler);
    return () =>
      ipcRenderer.removeListener(ELECTRON_CHANNELS.screensSessionChanged, handler);
  },
  listScreenDisplays: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.screensDisplays, input),
  openScreen: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.screensOpenWindow, input),
  createVirtualScreenForDevice: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.screensCreateVirtualForDevice, input),
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
  destroyVirtualScreen: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.screensDestroyVirtual, input),
  pressDeviceButton: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.screensPressButton, input),
  injectScreenTouch: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.screensInjectTouch, input),
  injectScreenKeyboard: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.screensInjectKeyboard, input),
  requestScreenVideo: (input) =>
    ipcRenderer.send(ELECTRON_CHANNELS.screensRequestVideo, input),
  sendScreenVideoCaptureResponse: (input) =>
    ipcRenderer.send(ELECTRON_CHANNELS.screensVideoCaptureResponse, input),

  getFlowRun: () => ipcRenderer.invoke(ELECTRON_CHANNELS.runsGet),
  startFlowRun: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.runsStart, input),
  stopFlowRun: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.runsStop, input),
  resumeFlowRun: (input) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.runsResume, input),
  onFlowRun: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      run: Parameters<typeof listener>[0],
    ) => listener(run);
    ipcRenderer.on(ELECTRON_CHANNELS.runsEvent, handler);
    return () => ipcRenderer.removeListener(ELECTRON_CHANNELS.runsEvent, handler);
  },
  onFlowRunLog: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      entry: Parameters<typeof listener>[0],
    ) => listener(entry);
    ipcRenderer.on(ELECTRON_CHANNELS.runsLogEvent, handler);
    return () =>
      ipcRenderer.removeListener(ELECTRON_CHANNELS.runsLogEvent, handler);
  },

  windowMinimize: () => ipcRenderer.invoke(ELECTRON_CHANNELS.windowMinimize),
  windowToggleMaximize: () =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.windowToggleMaximize),
  windowClose: () => ipcRenderer.invoke(ELECTRON_CHANNELS.windowClose),
  windowIsMaximized: () =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.windowIsMaximized),
  onWindowMaximized: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      maximized: boolean,
    ) => listener(maximized);
    ipcRenderer.on(ELECTRON_CHANNELS.windowMaximizedChanged, handler);
    return () =>
      ipcRenderer.removeListener(ELECTRON_CHANNELS.windowMaximizedChanged, handler);
  },
  getWindowContext: () =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.windowContext),
  openManagerWindow: () =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.windowOpenManager),
  openPairWindow: () =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.windowOpenPair),
  openSettingsWindow: () =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.windowOpenSettings),
  openScreenWindow: (ref) =>
    ipcRenderer.invoke(ELECTRON_CHANNELS.windowOpenScreen, ref),
};

ipcRenderer.on(ELECTRON_CHANNELS.screensVideoPort, (event, payload) => {
  window.postMessage(
    { type: SCREEN_VIDEO_WINDOW_EVENT, ...payload },
    "*",
    event.ports,
  );
});

contextBridge.exposeInMainWorld("androidPlatform", Object.freeze(api));
