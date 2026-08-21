import type {
  ConnectDeviceInput,
  ConnectDeviceResult,
  DisconnectDeviceResult,
  DeviceSessionDto,
  InstalledAppDto,
  ListDevicesResult,
} from "./device-contracts";
import type {
  CreateVirtualDisplayInput,
  DisplayIdInput,
  InjectScreenTouchInput,
  PressDeviceButtonInput,
  RequestScreenVideoInput,
  ScreenOperationResult,
  ScreenSessionDto,
  ScrcpySettings,
} from "./screen-contracts";
import type {
  CreateProjectInput,
  CreateRevisionInput,
  CreateRevisionResult,
  CreateScriptInput,
  CreateScriptResult,
  GetScriptInput,
  ListRevisionsInput,
  ListScriptsInput,
  ProjectDto,
  RestoreRevisionInput,
  RestoreRevisionResult,
  RevisionDto,
  SaveScriptDraftInput,
  SaveScriptDraftResult,
  ScriptDto,
} from "./project-contracts";

export const ELECTRON_CHANNELS = {
  systemInfo: "system:get-info",
  logsList: "logs:list",
  logsClear: "logs:clear",
  logsEntry: "logs:entry",
  projectsList: "projects:list",
  projectsCreate: "projects:create",
  scriptsList: "scripts:list",
  scriptsCreate: "scripts:create",
  scriptsGet: "scripts:get",
  scriptsSaveDraft: "scripts:save-draft",
  revisionsCreate: "revisions:create",
  revisionsList: "revisions:list",
  revisionsRestore: "revisions:restore",
  devicesList: "devices:list",
  devicesSession: "devices:session",
  devicesConnect: "devices:connect",
  devicesDisconnect: "devices:disconnect",
  devicesPackages: "devices:packages",
  screensSession: "screens:session",
  screensSettingsGet: "screens:settings:get",
  screensSettingsSet: "screens:settings:set",
  screensRefresh: "screens:refresh",
  screensStart: "screens:start",
  screensCreateVirtual: "screens:create-virtual",
  screensDestroyVirtual: "screens:destroy-virtual",
  screensPressButton: "screens:press-button",
  screensInjectTouch: "screens:inject-touch",
  screensRequestVideo: "screens:request-video",
  screensVideoPort: "screens:video-port",
} as const;

export const SCREEN_VIDEO_WINDOW_EVENT = "android-platform:screen-video-port";

export type SystemPlatform = "darwin" | "win32" | "unsupported";

export interface SystemInfo {
  runtime: "electron";
  platform: SystemPlatform;
  versions: {
    electron: string;
    chrome: string;
    node: string;
  };
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  id: number;
  level: LogLevel;
  message: string;
  source: "main" | "renderer";
  createdAt: string;
  location: string | null;
}

export function formatLogEntry(entry: LogEntry): string {
  return `${entry.createdAt} ${entry.level.toUpperCase()} [${entry.source}]${entry.location ? ` ${entry.location}` : ""} ${entry.message}`;
}

export type LogListener = (entry: LogEntry) => void;

export interface ElectronAPI {
  getSystemInfo(): Promise<SystemInfo>;
  listLogs(input?: { limit?: number }): Promise<LogEntry[]>;
  clearLogs(): Promise<void>;
  onLog(listener: LogListener): () => void;

  listProjects(): Promise<ProjectDto[]>;
  createProject(input: CreateProjectInput): Promise<ProjectDto>;

  listScripts(input: ListScriptsInput): Promise<ScriptDto[]>;
  createScript(input: CreateScriptInput): Promise<CreateScriptResult>;
  getScript(input: GetScriptInput): Promise<ScriptDto | null>;
  saveScriptDraft(input: SaveScriptDraftInput): Promise<SaveScriptDraftResult>;

  createRevision(input: CreateRevisionInput): Promise<CreateRevisionResult>;
  listRevisions(input: ListRevisionsInput): Promise<RevisionDto[]>;
  restoreRevision(input: RestoreRevisionInput): Promise<RestoreRevisionResult>;

  listDevices(): Promise<ListDevicesResult>;
  getDeviceSession(): Promise<DeviceSessionDto>;
  connectDevice(input: ConnectDeviceInput): Promise<ConnectDeviceResult>;
  disconnectDevice(): Promise<DisconnectDeviceResult>;
  listInstalledApps(): Promise<InstalledAppDto[]>;

  getScreenSession(): Promise<ScreenSessionDto>;
  getScrcpySettings(): Promise<ScrcpySettings>;
  setScrcpySettings(input: ScrcpySettings): Promise<ScrcpySettings>;
  refreshScreens(): Promise<ScreenOperationResult>;
  startScreen(input: DisplayIdInput): Promise<ScreenOperationResult>;
  createVirtualScreen(
    input: CreateVirtualDisplayInput,
  ): Promise<ScreenOperationResult>;
  destroyVirtualScreen(): Promise<ScreenOperationResult>;
  pressDeviceButton(
    input: PressDeviceButtonInput,
  ): Promise<ScreenOperationResult>;
  injectScreenTouch(
    input: InjectScreenTouchInput,
  ): Promise<ScreenOperationResult>;
  requestScreenVideo(input: RequestScreenVideoInput): void;
}
