import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { getDeviceSessionState } from "../device-session-state";

export const Route = createFileRoute("/(device)")({
  component: Outlet,
  beforeLoad: async () => {
    if ((await getDeviceSessionState()) === "connected") {
      throw redirect({ to: "/platform" });
    }
  },
});
