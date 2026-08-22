import { useNavigate } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";
import { useEffect } from "react";

import { useDevices } from "@/features/workbench/device/use-devices";
import { m } from "@/paraglide/messages.js";

import { DeviceConnectionPanel } from "./device-connection";

export function PairDeviceRoute() {
  const devices = useDevices();
  const navigate = useNavigate();

  const state = devices.session?.state ?? "disconnected";

  useEffect(() => {
    if (state === "connected") {
      void navigate({ to: "/$tab", params: { tab: "workbench" } });
    }
  }, [state, navigate]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b bg-card px-2">
        <span className="text-xs font-semibold">{m.pair_title()}</span>
        <span className="text-[10px] text-muted-foreground">
          {m.pair_subtitle()}
        </span>
      </div>

      <div className="grid min-h-0 flex-1 place-items-center gap-4 overflow-hidden p-4">
        <div className="flex w-full max-w-md flex-col gap-2 rounded-lg border bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <InfoIcon className="size-3.5 text-muted-foreground" />
            {m.pair_device_connection()}
          </div>
          <DeviceConnectionPanel manager={devices} />
        </div>
      </div>
    </div>
  );
}
