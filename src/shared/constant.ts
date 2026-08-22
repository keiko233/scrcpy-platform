/**
 * Central entry for shared constants.
 * Re-exports from ./constants/* and provides backward-compatible aliases
 * so existing imports keep working while new code can use enums.
 */

export * from "./constants/enums";
export * from "./constants/limits";
export * from "./constants/timing";
export * from "./constants/app";

// ---------------------------------------------------------------------------
// Backward-compatible aliases (avoid breaking existing imports)
// ---------------------------------------------------------------------------

import { ElectronChannel, QueryKey, StorageKey } from "./constants/enums";
import { LogLimits } from "./constants/limits";
import { Timing } from "./constants/timing";
import { AdbConstants, AppConstants, FilePath, MediaConstants, UiConstants } from "./constants/app";
import {
  FlowNodeKind,
  FlowDataType,
  ControlHandle,
  OcrLanguage,
  OcrMatchMode,
  OcrCharSet,
} from "./constants/enums";
import { ExpressionLimits } from "./constants/limits";

// Storage
export const LAYOUT_STORAGE_KEY = StorageKey.WorkbenchLayout;
export const SCRCPY_SETTINGS_STORAGE_KEY = StorageKey.ScrcpySettings;
export const LOCALE_STORAGE_KEY = StorageKey.Locale;
export const SIDEBAR_COOKIE_NAME = StorageKey.SidebarState;

// Channels
export const LOG_CHANNEL = ElectronChannel.LogsEntry;
export const SCREEN_VIDEO_WINDOW_EVENT = AppConstants.SCREEN_VIDEO_WINDOW_EVENT;
export const APP_FILE_SCHEME = AppConstants.FILE_SCHEME;

export const ELECTRON_CHANNELS = {
  systemInfo: ElectronChannel.SystemGetInfo,
  logsList: ElectronChannel.LogsList,
  logsClear: ElectronChannel.LogsClear,
  logsEntry: ElectronChannel.LogsEntry,
  projectsList: ElectronChannel.ProjectsList,
  projectsCreate: ElectronChannel.ProjectsCreate,
  scriptsList: ElectronChannel.ScriptsList,
  scriptsCreate: ElectronChannel.ScriptsCreate,
  scriptsGet: ElectronChannel.ScriptsGet,
  scriptsSaveDraft: ElectronChannel.ScriptsSaveDraft,
  revisionsCreate: ElectronChannel.RevisionsCreate,
  revisionsList: ElectronChannel.RevisionsList,
  revisionsRestore: ElectronChannel.RevisionsRestore,
  devicesList: ElectronChannel.DevicesList,
  devicesSession: ElectronChannel.DevicesSession,
  devicesConnect: ElectronChannel.DevicesConnect,
  devicesDisconnect: ElectronChannel.DevicesDisconnect,
  devicesPackages: ElectronChannel.DevicesPackages,
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

// Query keys
export const DEVICE_SESSION_QUERY_KEY = QueryKey.DeviceSession;
export const SCREEN_SESSION_QUERY_KEY = QueryKey.ScreenSession;
export const DEVICE_LIST_QUERY_KEY = QueryKey.DeviceList;
export const INSTALLED_APPS_QUERY_KEY = QueryKey.InstalledApps;
export const SCRCPY_SETTINGS_QUERY_KEY = QueryKey.ScrcpySettings;
export const PROJECTS_QUERY_KEY = QueryKey.Projects;
export const SCRIPTS_QUERY_KEY = QueryKey.Scripts;
export const SCRIPT_QUERY_KEY = QueryKey.Script;
export const REVISIONS_QUERY_KEY = QueryKey.Revisions;
export const FLOW_RUN_QUERY_KEY = QueryKey.FlowRun;
export const LOGS_QUERY_KEY = QueryKey.Logs;
export const SYSTEM_INFO_QUERY_KEY = QueryKey.SystemInfo;

// Timing
export const SCREEN_POLL_MS = Timing.SCREEN_POLL_MS;
export const SESSION_POLL_MS = Timing.DEVICE_SESSION_POLL_MS;

// Limits
export const MAX_EXPRESSION_LENGTH = ExpressionLimits.MAX_LENGTH;
export const MAX_TOKENS = ExpressionLimits.MAX_TOKENS;
export const MAX_DEPTH = ExpressionLimits.MAX_DEPTH;
export const MAX_LOG_FILE_BYTES = LogLimits.MAX_FILE_BYTES;
export const MAX_LOGS = LogLimits.MAX_FRONTEND_LOGS;

// Paths / media / adb / ui
export const SCRCPY_SERVER_PATH = FilePath.SCRCPY_SERVER;
export const ANDROID_RESOURCES_ARSC = FilePath.ANDROID_RESOURCES_ARSC;
export const ANDROID_MANIFEST = FilePath.ANDROID_MANIFEST;
export const AUDIO_SAMPLE_RATE = MediaConstants.AUDIO_SAMPLE_RATE;
export const AUDIO_CHANNELS = MediaConstants.AUDIO_CHANNELS;
export const DEFAULT_SAMPLE_RATE = MediaConstants.AUDIO_SAMPLE_RATE;
export const DEFAULT_ICON_DENSITY = MediaConstants.DEFAULT_ICON_DENSITY;
export const PNG_SIGNATURE = MediaConstants.PNG_SIGNATURE;
export const ADB_SERVER_DEFAULT_HOST = AdbConstants.DEFAULT_HOST;
export const ADB_SERVER_DEFAULT_PORT = AdbConstants.DEFAULT_PORT;
export const GROUP_PADDING = UiConstants.GROUP_PADDING;
export const DEFAULT_GROUP_WIDTH = UiConstants.GROUP_DEFAULT_WIDTH;
export const DEFAULT_GROUP_HEIGHT = UiConstants.GROUP_DEFAULT_HEIGHT;

// Flow derived arrays (keep zod compatibility)
export const FLOW_NODE_KINDS = Object.values(FlowNodeKind) as readonly FlowNodeKind[];
export const FLOW_DATA_TYPES = Object.values(FlowDataType) as readonly FlowDataType[];
export const CONTROL_SOURCE_HANDLES = new Set<string>([
  ControlHandle.Next,
  ControlHandle.True,
  ControlHandle.False,
  ControlHandle.Body,
  ControlHandle.Done,
]);
export const CONTROL_TARGET_HANDLES = new Set<string>([ControlHandle.In, ControlHandle.Loop]);
export const OCR_LANGUAGES = [OcrLanguage.Eng, OcrLanguage.ChiSim] as const;

// Whitelist for OCR char sets
export const OcrCharWhitelist: Record<OcrCharSet, string> = {
  [OcrCharSet.Any]: "",
  [OcrCharSet.Digits]: "0123456789",
  [OcrCharSet.Number]: "0123456789.,-",
  [OcrCharSet.Letters]: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
  [OcrCharSet.Alphanumeric]: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
};
