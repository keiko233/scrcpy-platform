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
  projectsList: "projects:list",
  projectsCreate: "projects:create",
  scriptsList: "scripts:list",
  scriptsCreate: "scripts:create",
  scriptsGet: "scripts:get",
  scriptsSaveDraft: "scripts:save-draft",
  revisionsCreate: "revisions:create",
  revisionsList: "revisions:list",
  revisionsRestore: "revisions:restore",
} as const;

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

export interface ElectronAPI {
  getSystemInfo(): Promise<SystemInfo>;

  listProjects(): Promise<ProjectDto[]>;
  createProject(input: CreateProjectInput): Promise<ProjectDto>;

  listScripts(input: ListScriptsInput): Promise<ScriptDto[]>;
  createScript(input: CreateScriptInput): Promise<CreateScriptResult>;
  getScript(input: GetScriptInput): Promise<ScriptDto | null>;
  saveScriptDraft(input: SaveScriptDraftInput): Promise<SaveScriptDraftResult>;

  createRevision(input: CreateRevisionInput): Promise<CreateRevisionResult>;
  listRevisions(input: ListRevisionsInput): Promise<RevisionDto[]>;
  restoreRevision(input: RestoreRevisionInput): Promise<RestoreRevisionResult>;
}
