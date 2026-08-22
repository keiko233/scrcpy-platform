import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import {
  deviceSessionQueryFn,
  deviceSessionQueryKey,
} from "@/hooks/query/use-device-session";
import { Titlebar } from "@/features/shell/titlebar";

export const Route = createFileRoute("/(device)")({
  component: () => (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <Titlebar />
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  ),
  beforeLoad: async ({ context }) => {
    const state = await context.queryClient
      .fetchQuery({
        queryKey: deviceSessionQueryKey,
        queryFn: deviceSessionQueryFn,
      })
      .then((session) => session.state)
      .catch(() => "disconnected" as const);
    if (state === "connected") {
      throw redirect({ to: "/$tab", params: { tab: "workbench" } });
    }
  },
});
