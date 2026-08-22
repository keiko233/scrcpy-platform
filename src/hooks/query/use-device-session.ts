import { useQuery } from "@tanstack/react-query";

import type { DeviceSessionDto } from "@/shared/device-contracts";

export const DEVICE_SESSION_QUERY_KEY = "device-session" as const;
export const deviceSessionQueryKey = [DEVICE_SESSION_QUERY_KEY] as const;
export const deviceSessionQueryFn = (): Promise<DeviceSessionDto> =>
  window.androidPlatform.getDeviceSession();

const SESSION_POLL_MS = 2000;

export function useDeviceSession() {
  return useQuery({
    queryKey: deviceSessionQueryKey,
    queryFn: deviceSessionQueryFn,
    refetchInterval: SESSION_POLL_MS,
    refetchOnWindowFocus: false,
    staleTime: 0,
    gcTime: Infinity,
  });
}