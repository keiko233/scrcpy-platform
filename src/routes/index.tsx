import { createFileRoute, redirect } from "@tanstack/react-router";

import { getDeviceSessionState } from "./device-session-state";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const state = await getDeviceSessionState();
    throw redirect({ to: state === "connected" ? "/platform" : "/pair" });
  },
  component: () => null,
});
