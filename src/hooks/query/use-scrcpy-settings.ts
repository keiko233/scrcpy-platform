import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ScrcpyConfiguredScope,
  ScrcpyOverridableScope,
  ScrcpyOverrides,
  ScrcpySettings,
  ScrcpySettingsScope,
  ScrcpySettingsScopeView,
} from "@/shared/screen-contracts";

export const SCRCPY_SETTINGS_QUERY_KEY = "scrcpy-settings" as const;
export const SCRCPY_SCOPES_QUERY_KEY = "scrcpy-settings-scopes" as const;

function scopeParts(scope: ScrcpySettingsScope): readonly unknown[] {
  if (scope.scope === "global") {
    return ["global"];
  }
  if (scope.scope === "device") {
    return ["device", scope.deviceKey];
  }
  return ["screen", scope.deviceKey, scope.displayId];
}

export function scrcpyScopeViewQueryKey(
  scope: ScrcpySettingsScope,
): readonly unknown[] {
  return [SCRCPY_SETTINGS_QUERY_KEY, ...scopeParts(scope)] as const;
}

export const scrcpyScopesQueryKey = [SCRCPY_SCOPES_QUERY_KEY] as const;

export function useScrcpyScopeView(scope: ScrcpySettingsScope) {
  return useQuery({
    queryKey: scrcpyScopeViewQueryKey(scope),
    queryFn: (): Promise<ScrcpySettingsScopeView> =>
      window.scrcpyPlatform.getScrcpySettings(scope),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function useSetScrcpyGlobalSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: ScrcpySettings) =>
      window.scrcpyPlatform.setScrcpyGlobalSettings(settings),
    onSuccess: (view) => {
      queryClient.setQueryData<ScrcpySettingsScopeView>(
        scrcpyScopeViewQueryKey(view.scope),
        view,
      );
    },
  });
}

export function useSetScrcpyScopeOverrides(scope: ScrcpyOverridableScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (overrides: ScrcpyOverrides) =>
      window.scrcpyPlatform.setScrcpyScopeOverrides(scope, overrides),
    onSuccess: (view) => {
      queryClient.setQueryData<ScrcpySettingsScopeView>(
        scrcpyScopeViewQueryKey(view.scope),
        view,
      );
      void queryClient.invalidateQueries({ queryKey: scrcpyScopesQueryKey });
    },
  });
}

export function useDeleteScrcpySettingsScope() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scope: ScrcpyOverridableScope) =>
      window.scrcpyPlatform.deleteScrcpySettingsScope(scope),
    onSuccess: (_result, scope) => {
      queryClient.removeQueries({
        queryKey: scrcpyScopeViewQueryKey(scope),
      });
      void queryClient.invalidateQueries({ queryKey: scrcpyScopesQueryKey });
    },
  });
}

export function useScrcpyConfiguredScopes() {
  return useQuery({
    queryKey: scrcpyScopesQueryKey,
    queryFn: (): Promise<ScrcpyConfiguredScope[]> =>
      window.scrcpyPlatform.listScrcpySettingsScopes(),
    staleTime: 30_000,
  });
}
