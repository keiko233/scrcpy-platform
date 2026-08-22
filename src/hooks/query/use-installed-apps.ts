import { useQuery } from "@tanstack/react-query";

import type { InstalledAppDto } from "@/shared/device-contracts";

export const INSTALLED_APPS_QUERY_KEY = "installed-apps" as const;

export function useInstalledApps(enabled: boolean, sessionId: string | null) {
  return useQuery<InstalledAppDto[]>({
    queryKey: [INSTALLED_APPS_QUERY_KEY, sessionId],
    queryFn: () => window.androidPlatform.listInstalledApps(),
    enabled: enabled && sessionId !== null,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}