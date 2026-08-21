import { useNavigate } from "@tanstack/react-router";
import { UnplugIcon } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

import { DebugSettingsTab } from "../debug/debug-tab";
import { useWorkbench } from "../use-workbench";

export function UpperRightTabs() {
  const { devices, flow } = useWorkbench();
  const { session, sessionLoaded, disconnecting, disconnect } = devices;
  const navigate = useNavigate();

  const state = session?.state ?? "disconnected";

  useEffect(() => {
    if (!sessionLoaded) {
      return;
    }
    if (state === "disconnected" || state === "error") {
      void navigate({ to: "/pair" });
    }
  }, [sessionLoaded, state, navigate]);

  const handleDisconnect = () => {
    if (flow.dirty) {
      const discard = window.confirm(
        "Disconnect the device? Unsaved changes will be discarded.",
      );
      if (!discard) {
        return;
      }
    }
    void disconnect();
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-0">
      <div className="flex h-8 w-full shrink-0 items-center justify-start gap-1 border-b px-2">
        <span className="text-xs font-medium">Debug</span>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          className="ml-0.5 shrink-0"
          disabled={disconnecting || state !== "connected"}
          loading={disconnecting}
          onClick={handleDisconnect}
          aria-label="Disconnect device"
        >
          <UnplugIcon />
          Disconnect
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        <DebugSettingsTab />
      </div>
    </div>
  );
}
