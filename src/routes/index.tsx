import { createFileRoute, redirect } from "@tanstack/react-router";

import {
  deviceSessionQueryFn,
  deviceSessionQueryKey,
} from "@/hooks/query/use-device-session";

export const Route = createFileRoute("/")({
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
    throw redirect({ to: "/pair" });
  },
  component: () => null,
});
