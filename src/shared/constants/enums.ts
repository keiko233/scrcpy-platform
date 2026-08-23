/**
 * Shared domain enums.
 * Prefer enums over string unions for finite sets that are used across
 * main / renderer / validation layers. This enables exhaustive checks,
 * IDE autocomplete and a single source of truth.
 */

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------

export enum FlowNodeKind {
  Start = "start",
  End = "end",
  Click = "click",
  Swipe = "swipe",
  Ocr = "ocr",
  Delay = "delay",
  Calculate = "calculate",
  Convert = "convert",
  Compare = "compare",
  If = "if",
  Merge = "merge",
  For = "for",
  While = "while",
  Assert = "assert",
  ScreenRegion = "screen-region",
  Constant = "constant",
  Note = "note",
  Group = "group",
  Input = "input",
  Output = "output",
  Call = "call",
}

export enum FlowDataType {
  Any = "any",
  String = "string",
  Number = "number",
  Boolean = "boolean",
  ScreenRegion = "screen-region",
}

export enum FlowValidationIssueKind {
  DuplicateNodeId = "duplicate-node-id",
  DuplicateEdgeId = "duplicate-edge-id",
  MissingStart = "missing-start",
  MultipleStarts = "multiple-starts",
  MissingEnd = "missing-end",
  MultipleEnds = "multiple-ends",
  MissingOutput = "missing-output",
  MissingEndpoint = "missing-endpoint",
  InvalidPort = "invalid-port",
  IncompatiblePortRole = "incompatible-port-role",
  IncompatiblePortType = "incompatible-port-type",
  IllegalPortCount = "illegal-port-count",
  InvalidLoopBack = "invalid-loop-back",
  IllegalIncoming = "illegal-incoming",
  IllegalOutgoing = "illegal-outgoing",
  Cycle = "cycle",
  UnreachableNode = "unreachable-node",
  MissingParamName = "missing-param-name",
  InvalidParamName = "invalid-param-name",
  DuplicateParamName = "duplicate-param-name",
  InvalidDataType = "invalid-data-type",
  InvalidDefaultValue = "invalid-default-value",
  DuplicateResultName = "duplicate-result-name",
  InconsistentOutputPorts = "inconsistent-output-ports",
  MissingCallTarget = "missing-call-target",
  UnknownCallTarget = "unknown-call-target",
  InvalidCallTarget = "invalid-call-target",
  MissingCallArgument = "missing-call-argument",
  CallCycle = "call-cycle",
}

export enum FlowPortDirection {
  Input = "input",
  Output = "output",
}

export enum FlowPortRole {
  Flow = "flow",
  Data = "data",
}

/** Control-flow handle names */
export enum ControlHandle {
  Next = "next",
  True = "true",
  False = "false",
  Body = "body",
  Done = "done",
  In = "in",
  Loop = "loop",
}

// ---------------------------------------------------------------------------
// Device / Screen / Run
// ---------------------------------------------------------------------------

export enum AdbDeviceState {
  Unauthorized = "unauthorized",
  Offline = "offline",
  Device = "device",
}

export enum DeviceSessionState {
  Disconnected = "disconnected",
  Connecting = "connecting",
  Connected = "connected",
  Disconnecting = "disconnecting",
  Error = "error",
}

export enum ScreenState {
  Disconnected = "disconnected",
  Idle = "idle",
  Starting = "starting",
  Streaming = "streaming",
  Switching = "switching",
  Error = "error",
}

export enum VideoCodec {
  H264 = "h264",
  H265 = "h265",
  Av1 = "av1",
}

export enum AudioSource {
  Output = "output",
  Playback = "playback",
  Mic = "mic",
}

export enum AudioCodec {
  Opus = "opus",
  Aac = "aac",
  Flac = "flac",
}

export enum DeviceButton {
  Back = "back",
  Home = "home",
  AppSwitch = "app-switch",
  Power = "power",
  VolumeUp = "volume-up",
  VolumeDown = "volume-down",
}

export enum TouchAction {
  Down = "down",
  Move = "move",
  Up = "up",
  Cancel = "cancel",
}

export enum ScreenFailureCode {
  NotConnected = "not-connected",
  NotStreaming = "not-streaming",
  DisplayNotFound = "display-not-found",
  VirtualDisplayExists = "virtual-display-exists",
  Busy = "busy",
  Unsupported = "unsupported",
  OperationFailed = "operation-failed",
}

export enum ConnectDeviceFailureCode {
  ServerUnavailable = "server-unavailable",
  DeviceMissing = "device-missing",
  DeviceNotReady = "device-not-ready",
  SessionBusy = "session-busy",
  ConnectionFailed = "connection-failed",
}

export enum FlowRunState {
  Running = "running",
  Paused = "paused",
  Completed = "completed",
  Failed = "failed",
  Cancelled = "cancelled",
}

export enum FlowRunStepState {
  Pending = "pending",
  Running = "running",
  Completed = "completed",
  Failed = "failed",
  Cancelled = "cancelled",
  Skipped = "skipped",
}

export enum LogLevel {
  Debug = "debug",
  Info = "info",
  Warn = "warn",
  Error = "error",
}

export enum SystemPlatform {
  Darwin = "darwin",
  Win32 = "win32",
  Unsupported = "unsupported",
}

export enum ResumeAction {
  Continue = "continue",
  Step = "step",
}

// ---------------------------------------------------------------------------
// OCR
// ---------------------------------------------------------------------------

export enum OcrLanguage {
  Eng = "eng",
  ChiSim = "chi_sim",
}

export enum OcrMatchMode {
  Contains = "contains",
  Exact = "exact",
  Regex = "regex",
}

export enum OcrCharSet {
  Any = "any",
  Digits = "digits",
  Number = "number",
  Letters = "letters",
  Alphanumeric = "alphanumeric",
}

export enum OcrLanguageOption {
  Eng = "eng",
  ChiSim = "chi_sim",
  EngChiSim = "eng+chi_sim",
}

// ---------------------------------------------------------------------------
// App / System
// ---------------------------------------------------------------------------

export enum StorageKey {
  /** Persisted workbench layout */
  WorkbenchLayout = "android-platform:workbench-layout",
  /** Last copied Flow Script selection for cross-script paste */
  WorkbenchFlowClipboard = "android-platform:workbench-flow-clipboard",
  /** Cached scrcpy settings */
  ScrcpySettings = "android-platform:scrcpy-settings",
  /** Allow running the current unsaved workbench graph */
  WorkbenchAllowUnsavedRun = "android-platform:workbench-allow-unsaved-run",
  /** Selected locale */
  Locale = "app.locale",
  /** Sidebar collapsed state cookie */
  SidebarState = "sidebar_state",
}

export enum ElectronChannel {
  SystemGetInfo = "system:get-info",
  LogsList = "logs:list",
  LogsClear = "logs:clear",
  LogsEntry = "logs:entry",
  ProjectsList = "projects:list",
  ProjectsCreate = "projects:create",
  ProjectsRename = "projects:rename",
  ProjectsDelete = "projects:delete",
  ScriptsList = "scripts:list",
  ScriptsCreate = "scripts:create",
  ScriptsGet = "scripts:get",
  ScriptsRename = "scripts:rename",
  ScriptsDelete = "scripts:delete",
  ScriptsSaveDraft = "scripts:save-draft",
  RevisionsCreate = "revisions:create",
  RevisionsList = "revisions:list",
  RevisionsRestore = "revisions:restore",
  DevicesList = "devices:list",
  DevicesSession = "devices:session",
  DevicesConnect = "devices:connect",
  DevicesDisconnect = "devices:disconnect",
  DevicesPackages = "devices:packages",
  DevicesPackagesEnrich = "devices:packages:enrich",
  ScreensSession = "screens:session",
  ScreensSettingsGet = "screens:settings:get",
  ScreensSettingsSet = "screens:settings:set",
  ScreensRefresh = "screens:refresh",
  ScreensStart = "screens:start",
  ScreensCreateVirtual = "screens:create-virtual",
  ScreensDestroyVirtual = "screens:destroy-virtual",
  ScreensPressButton = "screens:press-button",
  ScreensInjectTouch = "screens:inject-touch",
  ScreensRequestVideo = "screens:request-video",
  ScreensVideoPort = "screens:video-port",
  ScreensVideoCaptureResponse = "screens:video-capture-response",
  RunsGet = "runs:get",
  RunsStart = "runs:start",
  RunsStop = "runs:stop",
  RunsResume = "runs:resume",
  RunsEvent = "runs:event",
  RunsLogEvent = "runs:log-event",
  WindowMinimize = "window:minimize",
  WindowToggleMaximize = "window:toggle-maximize",
  WindowClose = "window:close",
  WindowIsMaximized = "window:is-maximized",
  WindowMaximizedChanged = "window:maximized-changed",
}

export enum QueryKey {
  DeviceSession = "device-session",
  ScreenSession = "screen-session",
  DeviceList = "device-list",
  InstalledApps = "installed-apps",
  ScrcpySettings = "scrcpy-settings",
  Projects = "projects",
  Scripts = "scripts",
  Script = "script",
  Revisions = "revisions",
  FlowRun = "flow-run",
  Logs = "logs",
  SystemInfo = "system-info",
}
