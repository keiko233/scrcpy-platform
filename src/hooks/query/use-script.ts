import { useQuery } from "@tanstack/react-query";

import type { ScriptDto } from "@/shared/project-contracts";

export const SCRIPT_QUERY_KEY = "script" as const;
export const scriptQueryKey = (scriptId: string) =>
  [SCRIPT_QUERY_KEY, scriptId] as const;
export const scriptQueryFn =
  (scriptId: string) => (): Promise<ScriptDto | null> =>
    window.scrcpyPlatform.getScript({ scriptId });

export function useScript(scriptId: string | null) {
  return useQuery({
    queryKey: scriptQueryKey(scriptId ?? ""),
    queryFn: scriptQueryFn(scriptId ?? ""),
    enabled: scriptId !== null,
    staleTime: 0,
    gcTime: Infinity,
  });
}