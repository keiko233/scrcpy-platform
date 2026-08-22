import { useQuery } from "@tanstack/react-query";

import type { ScreenSessionDto } from "@/shared/screen-contracts";

export const SCREEN_SESSION_QUERY_KEY = "screen-session" as const;
export const screenSessionQueryKey = [SCREEN_SESSION_QUERY_KEY] as const;
export const screenSessionQueryFn = (): Promise<ScreenSessionDto> =>
  window.androidPlatform.getScreenSession();

const SCREEN_POLL_MS = 1000;

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