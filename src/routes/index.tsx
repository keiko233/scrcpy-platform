import { createFileRoute, redirect } from "@tanstack/react-router";

import { getDeviceSessionState } from "@/stores/device-session-state";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const state = await getDeviceSessionState();
    if (state === "connected") {
      throw redirect({ to: "/$tab", params: { tab: "workbench" } });
    }
    throw redirect({ to: "/pair" });
  },
  component: () => null,
});
