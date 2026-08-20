import { Link } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

import { DeviceConnectionPanel } from "./device-connection";
import { useDevices } from "./use-devices";

export function PairDeviceRoute() {
  const devices = useDevices();

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b bg-card px-2">
        <span className="text-xs font-semibold">Pair a device</span>
        <span className="text-[10px] text-muted-foreground">
          ADB connection for automation
        </span>
        <div className="flex-1" />
        <Link to="/platform">
          <Button size="sm" variant="ghost">
            Open workbench
          </Button>
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 items-stretch justify-center gap-4 overflow-hidden p-4">
        <div className="flex w-full max-w-md flex-col gap-2 rounded-lg border bg-card p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <InfoIcon className="size-3.5 text-muted-foreground" />
            Device connection
          </div>
          <DeviceConnectionPanel manager={devices} />
        </div>
      </div>
    </div>
  );
}
