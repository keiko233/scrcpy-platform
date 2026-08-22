import { useQuery } from "@tanstack/react-query";

import type { DeviceSessionDto } from "@/shared/device-contracts";
import { QueryKey } from "@/shared/constants/enums";
import { Timing } from "@/shared/constants/timing";

export const DEVICE_SESSION_QUERY_KEY = QueryKey.DeviceSession;
export const deviceSessionQueryKey = [DEVICE_SESSION_QUERY_KEY] as const;
export const deviceSessionQueryFn = (): Promise<DeviceSessionDto> =>
  window.androidPlatform.getDeviceSession();

const SESSION_POLL_MS = Timing.DEVICE_SESSION_POLL_MS;

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