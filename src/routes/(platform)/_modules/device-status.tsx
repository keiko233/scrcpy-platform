import { useNavigate } from "@tanstack/react-router";
import { UnplugIcon } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useWorkbench } from "@/features/workbench/use-workbench";
import { m } from "@/paraglide/messages.js";

export function DeviceStatus(): React.ReactElement | null {
  const { devices, flow } = useWorkbench();
  const { session, disconnecting, disconnect } = devices;
  const navigate = useNavigate();

  useEffect(() => {
    if (session?.state === "disconnected") {
      void navigate({ to: "/pair" });
    }
  }, [session?.state, navigate]);

  if (session?.state !== "connected") {
    return null;
  }

  const handleDisconnect = () => {
    if (flow.dirty) {
      const discard = window.confirm(m.device_status_confirm_disconnect());
      if (!discard) {
        return;
      }
    }
    void disconnect();
  };

  return (
    <div className="app-no-drag flex items-center gap-2 px-2">
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="size-1.5 rounded-full bg-success" />
        {m.device_status_connected()}
      </span>
      <Button
        aria-label={m.device_status_disconnect_aria_label()}
        disabled={disconnecting}
        loading={disconnecting}
        onClick={handleDisconnect}
        size="sm"
        variant="ghost"
      >
        <UnplugIcon />
        {m.device_status_disconnect()}
      </Button>
    </div>
  );
}
