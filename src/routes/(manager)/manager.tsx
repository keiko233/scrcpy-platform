import { createFileRoute } from "@tanstack/react-router";

import { ManagerScreen } from "@/features/manager/manager-screen";
import { Titlebar } from "@/features/shell/titlebar";

export const Route = createFileRoute("/(manager)/manager")({
  component: () => (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <Titlebar />
      <div className="min-h-0 flex-1">
        <ManagerScreen />
      </div>
    </div>
  ),
});
