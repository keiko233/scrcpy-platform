import { contextBridge, ipcRenderer } from "electron";
import {
  ELECTRON_CHANNELS,
  type ElectronAPI,
} from "../shared/electron-api";

const api: ElectronAPI = {
  getSystemInfo: () => ipcRenderer.invoke(ELECTRON_CHANNELS.systemInfo),

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
};

contextBridge.exposeInMainWorld("androidPlatform", Object.freeze(api));
