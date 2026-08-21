import {
  ChevronLeftIcon,
  CircleIcon,
  MonitorIcon,
  PowerIcon,
  RefreshCwIcon,
  SmartphoneIcon,
  SquareIcon,
  Trash2Icon,
  Volume1Icon,
  Volume2Icon,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { DeviceButton } from "@/shared/screen-contracts";
import { useWorkbench } from "../use-workbench";

const DEVICE_BUTTONS: Array<{
  button: DeviceButton;
  label: string;
  icon: typeof ChevronLeftIcon;
}> = [
  { button: "back", label: "Back", icon: ChevronLeftIcon },
  { button: "home", label: "Home", icon: CircleIcon },
  { button: "app-switch", label: "Recent apps", icon: SquareIcon },
  { button: "power", label: "Power", icon: PowerIcon },
  { button: "volume-down", label: "Volume down", icon: Volume1Icon },
  { button: "volume-up", label: "Volume up", icon: Volume2Icon },
];

export function ScreenManagerTab() {
  const { screens, devices } = useWorkbench();
  const connected = devices.session?.state === "connected";
  const streaming = screens.screen?.streamId != null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-2.5 text-xs">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-medium">Android displays</span>
        <Badge size="sm" variant={streaming ? "success" : "outline"}>
          {screens.screen?.state ?? "disconnected"}
        </Badge>
        <Button
          aria-label="Refresh Android displays"
          className="ms-auto"
          disabled={!connected}
          loading={screens.busy}
          onClick={() => void screens.refresh()}
          size="icon-xs"
          title="Refresh displays"
          variant="ghost"
        >
          <RefreshCwIcon />
        </Button>
      </div>

      {screens.error !== null && (
        <Alert className="mb-2 py-2 text-[11px]" variant="error">
          <AlertDescription>{screens.error}</AlertDescription>
        </Alert>
      )}

      {!connected ? (
        <div className="mb-3 rounded-lg border border-dashed p-3 text-center text-muted-foreground">
          Connect a device to manage its displays.
        </div>
      ) : (
        <div className="mb-3 grid gap-1.5">
          {screens.screen?.displays.map((display) => {
            const active = screens.screen?.activeDisplayId === display.displayId;
            return (
              <button
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors hover:bg-accent/50 disabled:opacity-64",
                  active && "border-primary/50 bg-primary/5",
                )}
                disabled={screens.busy}
                key={display.displayId}
                onClick={() => void screens.selectDisplay(display.displayId)}
                type="button"
              >
                {display.kind === "virtual" ? (
                  <MonitorIcon className="size-3.5 text-muted-foreground" />
                ) : (
                  <SmartphoneIcon className="size-3.5 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{display.name}</span>
                  <span className="block text-[10px] text-muted-foreground">
                    Display {display.displayId} · {display.kind}
                  </span>
                </span>
                {display.primary && <Badge size="sm" variant="outline">Main</Badge>}
                {display.ownedBySession && (
                  <Badge size="sm" variant="info">Owned</Badge>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="mb-1.5 font-medium">Device controls</div>
      <div className="mb-3 grid grid-cols-6 gap-1">
        {DEVICE_BUTTONS.map(({ button, label, icon: Icon }) => (
          <Button
            aria-label={label}
            disabled={!streaming || screens.busy}
            key={button}
            onClick={() => void screens.pressButton(button)}
            size="icon-sm"
            title={label}
            variant="outline"
          >
            <Icon />
          </Button>
        ))}
      </div>

      <Button
        className="mt-auto"
        disabled={screens.screen?.ownedVirtualDisplayId == null || screens.busy}
        onClick={() => void screens.destroyVirtualDisplay()}
        size="xs"
        variant="destructive-outline"
      >
        <Trash2Icon />
        Destroy virtual display
      </Button>

    </div>
  );
}
