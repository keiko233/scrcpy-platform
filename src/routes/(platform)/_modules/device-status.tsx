import { useNavigate } from "@tanstack/react-router";
import { UnplugIcon } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useWorkbench } from "@/features/workbench/use-workbench";
import { useWindowContext } from "@/hooks/query/use-window-context";
import { m } from "@/paraglide/messages.js";

export function DeviceStatus(): React.ReactElement | null {
  const { devices, flow } = useWorkbench();
  const { session, disconnecting, disconnect } = devices;
  const navigate = useNavigate();
  const contextQuery = useWindowContext();
  const isScreenWindow = contextQuery.data?.context.kind === "screen";

  useEffect(() => {
    if (session?.state === "disconnected" && !isScreenWindow) {
      void navigate({ to: "/pair" });
    }
  }, [isScreenWindow, session?.state, navigate]);

  if (session?.state !== "connected") {
    return isScreenWindow ? (
      <span className="app-no-drag px-2 text-[11px] text-warning-foreground">{m.device_status_disconnected()}</span>
    ) : null;
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
      {!isScreenWindow && (
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
      )}
    </div>
  );
}
