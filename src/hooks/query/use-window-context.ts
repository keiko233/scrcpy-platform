import { useQuery } from "@tanstack/react-query";

import type { WindowBootstrapResult } from "@/shared/window-contracts";

export const windowContextQueryKey = ["window-context"] as const;

export function useWindowContext() {
  return useQuery<WindowBootstrapResult>({
    queryKey: windowContextQueryKey,
    queryFn: () => window.scrcpyPlatform.getWindowContext(),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
