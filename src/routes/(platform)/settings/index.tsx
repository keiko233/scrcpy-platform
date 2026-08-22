import { createFileRoute } from "@tanstack/react-router";

import { SettingsScreen } from "./_modules/settings-screen";

export const Route = createFileRoute("/(platform)/settings/")({
  component: SettingsScreen,
});
