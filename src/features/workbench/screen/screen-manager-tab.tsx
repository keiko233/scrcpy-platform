import { useState, type FormEvent } from "react";
import {
  ChevronLeftIcon,
  CircleIcon,
  MonitorIcon,
  PlusIcon,
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
import { Input } from "@/components/ui/input";
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
  const [width, setWidth] = useState("1280");
  const [height, setHeight] = useState("720");
  const [dpi, setDpi] = useState("320");
  const [packageName, setPackageName] = useState("");
  const connected = devices.session?.state === "connected";
  const streaming = screens.screen?.streamId != null;

  const createVirtual = (event: FormEvent) => {
    event.preventDefault();
    const parsedWidth = Number.parseInt(width, 10);
    const parsedHeight = Number.parseInt(height, 10);
    const parsedDpi = Number.parseInt(dpi, 10);
    if (
      !Number.isFinite(parsedWidth) ||
      !Number.isFinite(parsedHeight) ||
      !Number.isFinite(parsedDpi)
    ) {
      return;
    }
    void screens.createVirtualDisplay({
      width: parsedWidth,
      height: parsedHeight,
      dpi: parsedDpi,
      packageName: packageName.trim() || undefined,
    });
  };

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

      <form className="mt-auto rounded-lg border p-2.5" onSubmit={createVirtual}>
        <div className="mb-2 flex items-center gap-2 font-medium">
          <PlusIcon className="size-3.5" />
          Virtual display
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <label className="grid gap-1 text-[10px] text-muted-foreground">
            Width
            <Input
              max={7680}
              min={320}
              nativeInput
              onChange={(event) => setWidth(event.target.value)}
              size="sm"
              type="number"
              value={width}
            />
          </label>
          <label className="grid gap-1 text-[10px] text-muted-foreground">
            Height
            <Input
              max={7680}
              min={320}
              nativeInput
              onChange={(event) => setHeight(event.target.value)}
              size="sm"
              type="number"
              value={height}
            />
          </label>
          <label className="grid gap-1 text-[10px] text-muted-foreground">
            DPI
            <Input
              max={960}
              min={72}
              nativeInput
              onChange={(event) => setDpi(event.target.value)}
              size="sm"
              type="number"
              value={dpi}
            />
          </label>
        </div>
        <label className="mt-2 grid gap-1 text-[10px] text-muted-foreground">
          App package (optional)
          <Input
            nativeInput
            onChange={(event) => setPackageName(event.target.value)}
            placeholder="com.example.app"
            size="sm"
            value={packageName}
          />
        </label>
        <div className="mt-2 flex gap-1.5">
          <Button
            className="flex-1"
            disabled={!connected || screens.screen?.ownedVirtualDisplayId !== null}
            loading={screens.busy}
            size="xs"
            type="submit"
          >
            Create and open
          </Button>
          <Button
            aria-label="Destroy session virtual display"
            disabled={screens.screen?.ownedVirtualDisplayId == null || screens.busy}
            onClick={() => void screens.destroyVirtualDisplay()}
            size="icon-xs"
            title="Destroy virtual display"
            variant="destructive-outline"
          >
            <Trash2Icon />
          </Button>
        </div>
      </form>
    </div>
  );
}
