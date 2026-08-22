import { useQuery } from "@tanstack/react-query";

import type { InstalledAppDto } from "@/shared/device-contracts";
import { QueryKey } from "@/shared/constants/enums";
import { Timing } from "@/shared/constants/timing";

export const INSTALLED_APPS_QUERY_KEY = QueryKey.InstalledApps;

export function useInstalledApps(enabled: boolean, sessionId: string | null) {
  return useQuery<InstalledAppDto[]>({
    queryKey: [INSTALLED_APPS_QUERY_KEY, sessionId],
    queryFn: () => window.androidPlatform.listInstalledApps(),
    enabled: enabled && sessionId !== null,
    staleTime: Timing.INSTALLED_APPS_STALE_MS,
    gcTime: Timing.INSTALLED_APPS_GC_MS,
  });
}