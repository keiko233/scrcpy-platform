import { createFileRoute } from "@tanstack/react-router";

import { SettingsScreen } from "../(platform)/settings/_modules/settings-screen";
import { Titlebar } from "@/features/shell/titlebar";

export const Route = createFileRoute("/(settings)/settings")({
  component: () => (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <Titlebar />
      <div className="min-h-0 flex-1">
        <SettingsScreen />
      </div>
    </div>
  ),
});
