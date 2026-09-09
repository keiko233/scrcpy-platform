import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  CreateRevisionInput,
  RestoreRevisionInput,
  RevisionDto,
  ScriptDto,
} from "@/shared/project-contracts";

import { scriptsQueryKey } from "./use-scripts";

export const REVISIONS_QUERY_KEY = "revisions" as const;
export const revisionsQueryKey = (scriptId: string) =>
  [REVISIONS_QUERY_KEY, scriptId] as const;
export const revisionsQueryFn =
  (scriptId: string) => (): Promise<RevisionDto[]> =>
    window.scrcpyPlatform.listRevisions({ scriptId });

export function useRevisions(scriptId: string | null) {
  return useQuery({
    queryKey: revisionsQueryKey(scriptId ?? ""),
    queryFn: revisionsQueryFn(scriptId ?? ""),
    enabled: scriptId !== null,
    staleTime: 30_000,
    gcTime: Infinity,
  });
}

export function useCreateRevision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRevisionInput) =>
      window.scrcpyPlatform.createRevision(input),
    onSuccess: (result) => {
      if (result.status === "ok") {
        queryClient.setQueryData<RevisionDto[]>(
          revisionsQueryKey(result.revision.scriptId),
          (current) => {
            if (current === undefined) {
              return [result.revision];
            }
            return [...current, result.revision];
          },
        );
      }
    },
  });
}

export function useRestoreRevision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RestoreRevisionInput) =>
      window.scrcpyPlatform.restoreRevision(input),
    onSuccess: (result) => {
      if (result.status === "ok") {
        queryClient.setQueryData<ScriptDto[]>(
          scriptsQueryKey(result.script.projectId),
          (current) => {
            if (current === undefined) {
              return [result.script];
            }
            return current.map((item) =>
              item.id === result.script.id ? result.script : item,
            );
          },
        );
      }
    },
  });
}