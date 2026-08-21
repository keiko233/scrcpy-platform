import { useRouterState } from "@tanstack/react-router";

import { isTabId, type TabId } from "./tabs";

export function useActiveTabId(): TabId {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const segment = pathname.split("/").filter(Boolean)[0] ?? "";
  return isTabId(segment) ? segment : "workbench";
}
