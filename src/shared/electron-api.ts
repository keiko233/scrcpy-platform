import type {
  ConnectDeviceInput,
  ConnectDeviceResult,
  DisconnectDeviceResult,
  DeviceSessionDto,
  InstalledAppDto,
  InstalledAppsSnapshot,
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
  DeleteProjectInput,
  DeleteProjectResult,
  DeleteScriptInput,
  DeleteScriptResult,
  GetScriptInput,
  ListRevisionsInput,
  ListScriptsInput,
  ProjectDto,
  RenameProjectInput,
  RenameProjectResult,
  RenameScriptInput,
  RenameScriptResult,
  RestoreRevisionInput,
  RestoreRevisionResult,
  RevisionDto,
  SaveScriptDraftInput,
  SaveScriptDraftResult,
  ScriptDto,
} from "./project-contracts";
import type {
  FlowRunDto,
  FlowRunListener,
  FlowRunLogListener,
  ResumeFlowRunInput,
  ResumeFlowRunResult,
  StartFlowRunInput,
  StartFlowRunResult,
  StopFlowRunInput,
  StopFlowRunResult,
} from "./run-contracts";
import {
  ElectronChannel,
  SystemPlatform as SystemPlatformEnum,
} from "./constants/enums";
import { AppConstants } from "./constants/app";

export const ELECTRON_CHANNELS = {
  systemInfo: ElectronChannel.SystemGetInfo,
  logsList: ElectronChannel.LogsList,
  logsClear: ElectronChannel.LogsClear,
  logsEntry: ElectronChannel.LogsEntry,
  projectsList: ElectronChannel.ProjectsList,
  projectsCreate: ElectronChannel.ProjectsCreate,
  projectsRename: ElectronChannel.ProjectsRename,
  projectsDelete: ElectronChannel.ProjectsDelete,
  scriptsList: ElectronChannel.ScriptsList,
  scriptsCreate: ElectronChannel.ScriptsCreate,
  scriptsGet: ElectronChannel.ScriptsGet,
  scriptsRename: ElectronChannel.ScriptsRename,
  scriptsDelete: ElectronChannel.ScriptsDelete,
  scriptsSaveDraft: ElectronChannel.ScriptsSaveDraft,
  revisionsCreate: ElectronChannel.RevisionsCreate,
  revisionsList: ElectronChannel.RevisionsList,
  revisionsRestore: ElectronChannel.RevisionsRestore,
  devicesList: ElectronChannel.DevicesList,
  devicesSession: ElectronChannel.DevicesSession,
  devicesConnect: ElectronChannel.DevicesConnect,
  devicesDisconnect: ElectronChannel.DevicesDisconnect,
  devicesPackages: ElectronChannel.DevicesPackages,
  devicesPackagesEnrich: ElectronChannel.DevicesPackagesEnrich,
  screensSession: ElectronChannel.ScreensSession,
  screensSettingsGet: ElectronChannel.ScreensSettingsGet,
  screensSettingsSet: ElectronChannel.ScreensSettingsSet,
  screensRefresh: ElectronChannel.ScreensRefresh,
  screensStart: ElectronChannel.ScreensStart,
  screensCreateVirtual: ElectronChannel.ScreensCreateVirtual,
  screensDestroyVirtual: ElectronChannel.ScreensDestroyVirtual,
  screensPressButton: ElectronChannel.ScreensPressButton,
  screensInjectTouch: ElectronChannel.ScreensInjectTouch,
  screensRequestVideo: ElectronChannel.ScreensRequestVideo,
  screensVideoPort: ElectronChannel.ScreensVideoPort,
  runsGet: ElectronChannel.RunsGet,
  runsStart: ElectronChannel.RunsStart,
  runsStop: ElectronChannel.RunsStop,
  runsResume: ElectronChannel.RunsResume,
  runsEvent: ElectronChannel.RunsEvent,
  runsLogEvent: ElectronChannel.RunsLogEvent,
  windowMinimize: ElectronChannel.WindowMinimize,
  windowToggleMaximize: ElectronChannel.WindowToggleMaximize,
  windowClose: ElectronChannel.WindowClose,
  windowIsMaximized: ElectronChannel.WindowIsMaximized,
  windowMaximizedChanged: ElectronChannel.WindowMaximizedChanged,
} as const;

export const SCREEN_VIDEO_WINDOW_EVENT = AppConstants.SCREEN_VIDEO_WINDOW_EVENT;

export type SystemPlatform = `${SystemPlatformEnum}`;

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
  renameProject(input: RenameProjectInput): Promise<RenameProjectResult>;
  deleteProject(input: DeleteProjectInput): Promise<DeleteProjectResult>;

  listScripts(input: ListScriptsInput): Promise<ScriptDto[]>;
  createScript(input: CreateScriptInput): Promise<CreateScriptResult>;
  getScript(input: GetScriptInput): Promise<ScriptDto | null>;
  renameScript(input: RenameScriptInput): Promise<RenameScriptResult>;
  deleteScript(input: DeleteScriptInput): Promise<DeleteScriptResult>;
  saveScriptDraft(input: SaveScriptDraftInput): Promise<SaveScriptDraftResult>;

  createRevision(input: CreateRevisionInput): Promise<CreateRevisionResult>;
  listRevisions(input: ListRevisionsInput): Promise<RevisionDto[]>;
  restoreRevision(input: RestoreRevisionInput): Promise<RestoreRevisionResult>;

  listDevices(): Promise<ListDevicesResult>;
  getDeviceSession(): Promise<DeviceSessionDto>;
  connectDevice(input: ConnectDeviceInput): Promise<ConnectDeviceResult>;
  disconnectDevice(): Promise<DisconnectDeviceResult>;
  listInstalledApps(): Promise<InstalledAppsSnapshot>;
  enrichInstalledApps(packages: string[]): Promise<InstalledAppDto[]>;

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

  getFlowRun(): Promise<FlowRunDto | null>;
  startFlowRun(input: StartFlowRunInput): Promise<StartFlowRunResult>;
  stopFlowRun(input: StopFlowRunInput): Promise<StopFlowRunResult>;
  resumeFlowRun(input: ResumeFlowRunInput): Promise<ResumeFlowRunResult>;
  onFlowRun(listener: FlowRunListener): () => void;
  onFlowRunLog(listener: FlowRunLogListener): () => void;

  windowMinimize(): Promise<void>;
  windowToggleMaximize(): Promise<void>;
  windowClose(): Promise<void>;
  windowIsMaximized(): Promise<boolean>;
  onWindowMaximized(listener: (maximized: boolean) => void): () => void;
}
