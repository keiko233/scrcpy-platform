import { ipcMain } from "electron";
import {
  CreateProjectInputSchema,
  CreateRevisionInputSchema,
  CreateScriptInputSchema,
  DeleteProjectInputSchema,
  DeleteScriptInputSchema,
  GetScriptInputSchema,
  ListRevisionsInputSchema,
  ListScriptsInputSchema,
  RenameProjectInputSchema,
  RenameScriptInputSchema,
  RestoreRevisionInputSchema,
  SaveScriptDraftInputSchema,
  type CreateRevisionResult,
  type CreateScriptResult,
  type DeleteProjectResult,
  type DeleteScriptResult,
  type RenameProjectResult,
  type RenameScriptResult,
  type RestoreRevisionResult,
  type SaveScriptDraftResult,
} from "../../shared/project-contracts";
import { ELECTRON_CHANNELS } from "../../shared/electron-api";
import type { ProjectStore } from "../persistence/project-store";
import {
  ConflictError,
  NotFoundError,
  StaleDraftError,
} from "../persistence/project-store";

export function registerProjectHandlers(store: ProjectStore): void {
  ipcMain.handle(ELECTRON_CHANNELS.projectsList, () => store.listProjects());

  ipcMain.handle(ELECTRON_CHANNELS.projectsCreate, (_event, raw: unknown) => {
    const input = CreateProjectInputSchema.parse(raw);
    return store.createProject(input);
  });

  ipcMain.handle(
    ELECTRON_CHANNELS.projectsRename,
    (_event, raw: unknown): RenameProjectResult => {
      const input = RenameProjectInputSchema.parse(raw);
      try {
        return { status: "ok", project: store.renameProject(input) };
      } catch (error) {
        if (error instanceof NotFoundError) {
          return { status: "error", error: "project-not-found" };
        }
        throw error;
      }
    },
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.projectsDelete,
    (_event, raw: unknown): DeleteProjectResult => {
      const input = DeleteProjectInputSchema.parse(raw);
      try {
        store.deleteProject(input);
        return { status: "ok" };
      } catch (error) {
        if (error instanceof NotFoundError) {
          return { status: "error", error: "project-not-found" };
        }
        throw error;
      }
    },
  );

  ipcMain.handle(ELECTRON_CHANNELS.scriptsList, (_event, raw: unknown) => {
    const input = ListScriptsInputSchema.parse(raw);
    return store.listScripts(input);
  });

  ipcMain.handle(
    ELECTRON_CHANNELS.scriptsCreate,
    (_event, raw: unknown): CreateScriptResult => {
      const input = CreateScriptInputSchema.parse(raw);
      try {
        return { status: "ok", script: store.createScript(input) };
      } catch (error) {
        if (error instanceof NotFoundError) {
          return { status: "error", error: "project-not-found" };
        }
        if (error instanceof ConflictError) {
          return { status: "error", error: "path-conflict" };
        }
        throw error;
      }
    },
  );

  ipcMain.handle(ELECTRON_CHANNELS.scriptsGet, (_event, raw: unknown) => {
    const input = GetScriptInputSchema.parse(raw);
    return store.getScript(input);
  });

  ipcMain.handle(
    ELECTRON_CHANNELS.scriptsRename,
    (_event, raw: unknown): RenameScriptResult => {
      const input = RenameScriptInputSchema.parse(raw);
      try {
        return { status: "ok", script: store.renameScript(input) };
      } catch (error) {
        if (error instanceof NotFoundError) {
          return { status: "error", error: "script-not-found" };
        }
        throw error;
      }
    },
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.scriptsDelete,
    (_event, raw: unknown): DeleteScriptResult => {
      const input = DeleteScriptInputSchema.parse(raw);
      try {
        store.deleteScript({ scriptId: input.scriptId });
        return { status: "ok" };
      } catch (error) {
        if (error instanceof NotFoundError) {
          return { status: "error", error: "script-not-found" };
        }
        throw error;
      }
    },
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.scriptsSaveDraft,
    (_event, raw: unknown): SaveScriptDraftResult => {
      const input = SaveScriptDraftInputSchema.parse(raw);
      try {
        return { status: "ok", script: store.saveScriptDraft(input) };
      } catch (error) {
        if (error instanceof NotFoundError) {
          return { status: "error", error: "script-not-found" };
        }
        if (error instanceof StaleDraftError) {
          return { status: "error", error: "stale-draft" };
        }
        throw error;
      }
    },
  );

  ipcMain.handle(
    ELECTRON_CHANNELS.revisionsCreate,
    (_event, raw: unknown): CreateRevisionResult => {
      const input = CreateRevisionInputSchema.parse(raw);
      try {
        return { status: "ok", revision: store.createRevision(input) };
      } catch (error) {
        if (error instanceof NotFoundError) {
          return { status: "error", error: "script-not-found" };
        }
        throw error;
      }
    },
  );

  ipcMain.handle(ELECTRON_CHANNELS.revisionsList, (_event, raw: unknown) => {
    const input = ListRevisionsInputSchema.parse(raw);
    return store.listRevisions(input);
  });

  ipcMain.handle(
    ELECTRON_CHANNELS.revisionsRestore,
    (_event, raw: unknown): RestoreRevisionResult => {
      const input = RestoreRevisionInputSchema.parse(raw);
      try {
        return { status: "ok", script: store.restoreRevision(input) };
      } catch (error) {
        if (error instanceof NotFoundError) {
          if (error.kind === "revision") {
            return { status: "error", error: "revision-not-found" };
          }
          return { status: "error", error: "script-not-found" };
        }
        if (error instanceof StaleDraftError) {
          return { status: "error", error: "stale-draft" };
        }
        throw error;
      }
    },
  );
}
