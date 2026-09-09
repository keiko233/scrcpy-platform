import { useQuery } from "@tanstack/react-query";

import type { SystemInfo } from "@/shared/electron-api";

export const SYSTEM_INFO_QUERY_KEY = "system-info" as const;
export const systemInfoQueryKey = [SYSTEM_INFO_QUERY_KEY] as const;
export const systemInfoQueryFn = (): Promise<SystemInfo> =>
  window.scrcpyPlatform.getSystemInfo();

export function useSystemInfo() {
  return useQuery({
    queryKey: systemInfoQueryKey,
    queryFn: systemInfoQueryFn,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}