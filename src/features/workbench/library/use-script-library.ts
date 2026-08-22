import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useCreateProject, useProjects } from "@/hooks/query/use-projects";
import { useCreateScript, useScripts, scriptsQueryKey } from "@/hooks/query/use-scripts";
import {
  useCreateRevision,
  useRevisions,
  useRestoreRevision,
} from "@/hooks/query/use-revisions";
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

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function useScriptLibrary(): ScriptLibrary {
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const projectsQuery = useProjects();
  const scriptsQuery = useScripts(selectedProjectId);
  const revisionsQuery = useRevisions(selectedScriptId);
  const createProjectMutation = useCreateProject();
  const createScriptMutation = useCreateScript();
  const createRevisionMutation = useCreateRevision();
  const restoreRevisionMutation = useRestoreRevision();

  const projects = projectsQuery.data ?? [];
  const scripts = scriptsQuery.data ?? [];
  const revisions = revisionsQuery.data ?? [];
  const loading = projectsQuery.isLoading;

  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? null;
  const selectedScript =
    scripts.find((script) => script.id === selectedScriptId) ?? null;

  const refreshProjects = useCallback(async () => {
    await projectsQuery.refetch();
  }, [projectsQuery]);

  const selectProject = useCallback(async (projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedScriptId(null);
    setError(null);
  }, []);

  const selectScript = useCallback(async (scriptId: string | null) => {
    setSelectedScriptId(scriptId);
    setError(null);
  }, []);

  const createProject = useCallback(
    async (name: string): Promise<ProjectDto | null> => {
      setBusy(true);
      setError(null);
      try {
        return await createProjectMutation.mutateAsync({ name });
      } catch (cause) {
        setError(errorMessage(cause));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [createProjectMutation],
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
        const result = await createScriptMutation.mutateAsync({
          projectId: selectedProjectId,
          name,
          path,
        });
        if (result.status === "ok") {
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
        setError(errorMessage(cause));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [selectedProjectId, createScriptMutation, selectScript],
  );

  const createRevision = useCallback(
    async (message?: string | null): Promise<boolean> => {
      if (selectedScriptId === null) {
        return false;
      }
      setBusy(true);
      setError(null);
      try {
        const result = await createRevisionMutation.mutateAsync({
          scriptId: selectedScriptId,
          message: message ?? null,
        });
        if (result.status === "ok") {
          return true;
        }
        setError("The script no longer exists.");
        return false;
      } catch (cause) {
        setError(errorMessage(cause));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [selectedScriptId, createRevisionMutation],
  );

  const restoreRevision = useCallback(
    async (revision: RevisionDto): Promise<boolean> => {
      if (selectedScript === null) {
        return false;
      }
      setBusy(true);
      setError(null);
      try {
        const result = await restoreRevisionMutation.mutateAsync({
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
        setError(errorMessage(cause));
        return false;
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedScript?.id, selectedScript?.draftVersion, restoreRevisionMutation],
  );

  const applyScriptUpdate = useCallback(
    (script: ScriptDto) => {
      queryClient.setQueryData<ScriptDto[]>(
        scriptsQueryKey(script.projectId),
        (current) => {
          if (current === undefined) {
            return [script];
          }
          return current.map((item) =>
            item.id === script.id ? script : item,
          );
        },
      );
      setSelectedScriptId(script.id);
    },
    [queryClient],
  );

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