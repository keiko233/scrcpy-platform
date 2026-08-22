import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type { ScrcpySettings } from "@/shared/screen-contracts";

export const SCRCPY_SETTINGS_QUERY_KEY = "scrcpy-settings" as const;
export const scrcpySettingsQueryKey = [SCRCPY_SETTINGS_QUERY_KEY] as const;
export const scrcpySettingsQueryFn = (): Promise<ScrcpySettings> =>
  window.androidPlatform.getScrcpySettings();

export function useScrcpySettings() {
  return useQuery({
    queryKey: scrcpySettingsQueryKey,
    queryFn: scrcpySettingsQueryFn,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function useSetScrcpySettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ScrcpySettings) =>
      window.androidPlatform.setScrcpySettings(input),
    onSuccess: (settings) => {
      queryClient.setQueryData<ScrcpySettings>(
        scrcpySettingsQueryKey,
        settings,
      );
    },
  });
}