import { useQuery } from "@tanstack/react-query";

import type { ScreenSessionDto } from "@/shared/screen-contracts";
import { QueryKey } from "@/shared/constants/enums";
import { Timing } from "@/shared/constants/timing";

export const SCREEN_SESSION_QUERY_KEY = QueryKey.ScreenSession;
export const screenSessionQueryKey = [SCREEN_SESSION_QUERY_KEY] as const;
export const screenSessionQueryFn = (): Promise<ScreenSessionDto> =>
  window.androidPlatform.getScreenSession();

const SCREEN_POLL_MS = Timing.SCREEN_POLL_MS;

export function useScreenSession() {
  return useQuery({
    queryKey: screenSessionQueryKey,
    queryFn: screenSessionQueryFn,
    refetchInterval: SCREEN_POLL_MS,
    refetchOnWindowFocus: false,
    staleTime: 0,
    gcTime: Infinity,
  });
}