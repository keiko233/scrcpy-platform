import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { InstalledAppDto } from "@/shared/device-contracts";
import { QueryKey } from "@/shared/constants/enums";
import { Timing } from "@/shared/constants/timing";

export const INSTALLED_APPS_QUERY_KEY = QueryKey.InstalledApps;

export interface InstalledAppsData {
  apps: InstalledAppDto[];
  /** Packages whose display name has not been resolved yet */
  pending: string[];
}

function sortApps(apps: Iterable<InstalledAppDto>): InstalledAppDto[] {
  return [...apps].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
  );
}

export function useInstalledApps(
  enabled: boolean,
  sessionId: string | null,
  transportId: string | null,
) {
  const queryClient = useQueryClient();
  const deviceKey = transportId ?? sessionId ?? "none";
  const queryKey = useMemo(
    () => [INSTALLED_APPS_QUERY_KEY, deviceKey] as const,
    [deviceKey],
  );

  const query = useQuery<InstalledAppsData>({
    queryKey,
    queryFn: async (): Promise<InstalledAppsData> => {
      const snapshot = await window.scrcpyPlatform.listInstalledApps();
      return { apps: snapshot.apps, pending: snapshot.pending };
    },
    enabled: enabled && sessionId !== null,
    staleTime: Timing.INSTALLED_APPS_STALE_MS,
    gcTime: Timing.INSTALLED_APPS_GC_MS,
    placeholderData: (previous) => previous,
  });

  const data = query.data;

  useEffect(() => {
    if (
      !enabled ||
      query.isPending ||
      data === undefined ||
      data.pending.length === 0
    ) {
      return;
    }
    const batch = data.pending.slice(0, Timing.INSTALLED_APPS_ENRICH_BATCH_SIZE);
    let cancelled = false;
    void (async () => {
      try {
        const enriched = await window.scrcpyPlatform.enrichInstalledApps(batch);
        if (cancelled) {
          return;
        }
        queryClient.setQueryData<InstalledAppsData>(queryKey, (previous) => {
          if (previous === undefined) {
            return previous;
          }
          const byName = new Map(
            previous.apps.map((app) => [app.packageName, app]),
          );
          for (const app of enriched) {
            byName.set(app.packageName, app);
          }
          return {
            apps: sortApps(byName.values()),
            pending: previous.pending.filter(
              (packageName) => !batch.includes(packageName),
            ),
          };
        });
      } catch {
        if (!cancelled) {
          queryClient.setQueryData<InstalledAppsData>(queryKey, (previous) =>
            previous === undefined
              ? previous
              : {
                  ...previous,
                  pending: previous.pending.filter(
                    (packageName) => !batch.includes(packageName),
                  ),
                },
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryClient, queryKey, query.isPending, data, enabled]);

  return {
    ...query,
    isEnriching: !query.isPending && (data?.pending.length ?? 0) > 0,
  };
}