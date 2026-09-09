import { useQuery } from "@tanstack/react-query";

import type { ListDevicesResult } from "@/shared/device-contracts";

export const DEVICE_LIST_QUERY_KEY = "device-list" as const;
export const deviceListQueryKey = [DEVICE_LIST_QUERY_KEY] as const;
export const deviceListQueryFn = (): Promise<ListDevicesResult> =>
  window.scrcpyPlatform.listDevices();

export function useDeviceList() {
  return useQuery({
    queryKey: deviceListQueryKey,
    queryFn: deviceListQueryFn,
    staleTime: 0,
    gcTime: Infinity,
  });
}