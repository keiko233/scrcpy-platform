import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { getDeviceSessionState } from "../device-session-state";

export const Route = createFileRoute("/(platform)")({
  component: Outlet,
  beforeLoad: async () => {
    if ((await getDeviceSessionState()) !== "connected") {
      throw redirect({ to: "/pair" });
    }
  },
});
