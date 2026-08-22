import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import type {
  CreateScriptInput,
  DeleteScriptInput,
  RenameScriptInput,
  SaveScriptDraftInput,
  ScriptDto,
} from "@/shared/project-contracts";
import { scriptQueryKey } from "@/hooks/query/use-script";

export const SCRIPTS_QUERY_KEY = "scripts" as const;
export const scriptsQueryKey = (projectId: string) =>
  [SCRIPTS_QUERY_KEY, projectId] as const;
export const scriptsQueryFn =
  (projectId: string) => (): Promise<ScriptDto[]> =>
    window.androidPlatform.listScripts({ projectId });

export function useScripts(projectId: string | null) {
  return useQuery({
    queryKey: scriptsQueryKey(projectId ?? ""),
    queryFn: scriptsQueryFn(projectId ?? ""),
    enabled: projectId !== null,
    staleTime: 30_000,
    gcTime: Infinity,
  });
}

function updateScriptInCache(queryClient: QueryClient, script: ScriptDto): void {
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
}

export function useCreateScript() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateScriptInput) =>
      window.androidPlatform.createScript(input),
    onSuccess: (result) => {
      if (result.status === "ok") {
        queryClient.setQueryData<ScriptDto[]>(
          scriptsQueryKey(result.script.projectId),
          (current) => {
            if (current === undefined) {
              return [result.script];
            }
            return [...current, result.script];
          },
        );
      }
    },
  });
}

export function useRenameScript() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RenameScriptInput) =>
      window.androidPlatform.renameScript(input),
    onSuccess: (result) => {
      if (result.status === "ok") {
        updateScriptInCache(queryClient, result.script);
      }
    },
  });
}

export function useDeleteScript() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DeleteScriptInput) =>
      window.androidPlatform.deleteScript(input),
    onSuccess: (result, variables) => {
      if (result.status === "ok") {
        queryClient.setQueryData<ScriptDto[]>(
          scriptsQueryKey(variables.projectId),
          (current) => {
            if (current === undefined) {
              return current;
            }
            return current.filter((script) => script.id !== variables.scriptId);
          },
        );
        queryClient.removeQueries({
          queryKey: scriptQueryKey(variables.scriptId),
        });
      }
    },
  });
}

export function useSaveScriptDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveScriptDraftInput) =>
      window.androidPlatform.saveScriptDraft(input),
    onSuccess: (result) => {
      if (result.status === "ok") {
        updateScriptInCache(queryClient, result.script);
      }
    },
  });
}