import { Badge } from "@/components/ui/badge";
import { EmptyMedia } from "@/components/ui/empty";
import { MonitorIcon, VideoOffIcon } from "lucide-react";
import { useWorkbench } from "../use-workbench";

const STATE_VARIANT: Record<string, "outline" | "success" | "warning" | "error"> =
  {
    disconnected: "outline",
    connecting: "warning",
    connected: "success",
    disconnecting: "warning",
    error: "error",
  };

export function DeviceMonitor() {
  const { devices } = useWorkbench();
  const { session } = devices;

  const state = session?.state ?? "disconnected";
  const variant = STATE_VARIANT[state] ?? "outline";

  return (
    <div className="wb-panel">
      <div className="wb-panel-header">
        <MonitorIcon className="size-3.5" />
        Monitor
        <div className="ms-auto flex items-center gap-1.5">
          <Badge size="sm" variant={variant}>
            {state}
          </Badge>
        </div>
      </div>

      <div className="wb-panel-body gap-2 p-2">
        <div className="relative flex min-h-0 flex-1 items-center justify-center rounded-lg border bg-muted/30">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 px-6 text-center">
              <EmptyMedia variant="icon" className="mb-0">
                <VideoOffIcon aria-hidden="true" className="size-4" />
              </EmptyMedia>
              <div className="text-xs font-medium text-foreground">
                Video stream not connected
              </div>
              <p className="max-w-56 text-[11px] leading-4 text-muted-foreground">
                scrcpy video capture is not wired up yet. The device shows here
                as soon as a live stream exists.
              </p>
            </div>
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-[11px]">
          <span className="text-muted-foreground">Session</span>
          <span className="truncate text-right font-mono" title={session?.sessionId}>
            {session?.sessionId ?? "—"}
          </span>
          <span className="text-muted-foreground">Device</span>
          <span className="truncate text-right font-mono" title={session?.serial ?? undefined}>
            {session?.serial ?? "—"}
          </span>
          <span className="text-muted-foreground">Display</span>
          <span className="text-right font-mono">—</span>
        </div>
      </div>
    </div>
  );
}
