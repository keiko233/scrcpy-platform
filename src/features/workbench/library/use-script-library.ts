import { useCallback, useEffect, useState } from "react";

import type {
  ProjectDto,
  RevisionDto,
  ScriptDto,
} from "@/shared/project-contracts";

export interface ScriptLibrary {
  projects: ProjectDto[];
  scripts: ScriptDto[];
  revisions: RevisionDto[];
  selectedProjectId: string | null;
  selectedScriptId: string | null;
  selectedProject: ProjectDto | null;
  selectedScript: ScriptDto | null;
  loading: boolean;
  error: string | null;
  busy: boolean;
  refreshProjects: () => Promise<void>;
  selectProject: (projectId: string) => Promise<void>;
  selectScript: (scriptId: string | null) => Promise<void>;
  createProject: (name: string) => Promise<ProjectDto | null>;
  createScript: (name: string) => Promise<ScriptDto | null>;
  createRevision: (message?: string | null) => Promise<boolean>;
  restoreRevision: (revision: RevisionDto) => Promise<boolean>;
  applyScriptUpdate: (script: ScriptDto) => void;
  clearError: () => void;
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "script";
}

export function useScriptLibrary(): ScriptLibrary {
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [scripts, setScripts] = useState<ScriptDto[]>([]);
  const [revisions, setRevisions] = useState<RevisionDto[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? null;
  const selectedScript =
    scripts.find((script) => script.id === selectedScriptId) ?? null;

  const refreshProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.androidPlatform.listProjects();
      setProjects(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  const selectProject = useCallback(async (projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedScriptId(null);
    setScripts([]);
    setRevisions([]);
    setError(null);
    try {
      const result = await window.androidPlatform.listScripts({ projectId });
      setScripts(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const selectScript = useCallback(async (scriptId: string | null) => {
    setSelectedScriptId(scriptId);
    setRevisions([]);
    setError(null);
    if (scriptId === null) {
      return;
    }
    try {
      const result = await window.androidPlatform.listRevisions({ scriptId });
      setRevisions(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const createProject = useCallback(
    async (name: string): Promise<ProjectDto | null> => {
      setBusy(true);
      setError(null);
      try {
        const project = await window.androidPlatform.createProject({ name });
        setProjects((current) => [...current, project]);
        return project;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const createScript = useCallback(
    async (name: string): Promise<ScriptDto | null> => {
      if (selectedProjectId === null) {
        setError("Select a project before creating a script.");
        return null;
      }
      const path = `/flows/${slugify(name)}.json`;
      setBusy(true);
      setError(null);
      try {
        const result = await window.androidPlatform.createScript({
          projectId: selectedProjectId,
          name,
          path,
        });
        if (result.status === "ok") {
          setScripts((current) => [...current, result.script]);
          await selectScript(result.script.id);
          return result.script;
        }
        setError(
          result.error === "project-not-found"
            ? "Project no longer exists."
            : `A script at ${path} already exists in this project.`,
        );
        return null;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [selectedProjectId, selectScript],
  );

  const createRevision = useCallback(
    async (message?: string | null): Promise<boolean> => {
      if (selectedScriptId === null) {
        return false;
      }
      setBusy(true);
      setError(null);
      try {
        const result = await window.androidPlatform.createRevision({
          scriptId: selectedScriptId,
          message: message ?? null,
        });
        if (result.status === "ok") {
          setRevisions((current) => [...current, result.revision]);
          return true;
        }
        setError("The script no longer exists.");
        return false;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [selectedScriptId],
  );

  const restoreRevision = useCallback(
    async (revision: RevisionDto): Promise<boolean> => {
      if (selectedScript === null) {
        return false;
      }
      setBusy(true);
      setError(null);
      try {
        const result = await window.androidPlatform.restoreRevision({
          scriptId: selectedScript.id,
          revisionId: revision.id,
          expectedDraftVersion: selectedScript.draftVersion,
        });
        if (result.status === "ok") {
          applyScriptUpdate(result.script);
          return true;
        }
        setError(
          result.error === "stale-draft"
            ? "The draft changed since this revision was picked. Reload the latest draft and try again."
            : result.error === "revision-not-found"
              ? "That revision no longer exists."
              : "The script no longer exists.",
        );
        return false;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        return false;
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedScript?.id, selectedScript?.draftVersion],
  );

  const applyScriptUpdate = useCallback((script: ScriptDto) => {
    setScripts((current) =>
      current.map((item) => (item.id === script.id ? script : item)),
    );
    setSelectedScriptId(script.id);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    projects,
    scripts,
    revisions,
    selectedProjectId,
    selectedScriptId,
    selectedProject,
    selectedScript,
    loading,
    error,
    busy,
    refreshProjects,
    selectProject,
    selectScript,
    createProject,
    createScript,
    createRevision,
    restoreRevision,
    applyScriptUpdate,
    clearError,
  };
}
