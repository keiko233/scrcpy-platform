import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ChevronLeftIcon,
  CircleIcon,
  MonitorIcon,
  PlusIcon,
  PowerIcon,
  SmartphoneIcon,
  SquareIcon,
  VideoOffIcon,
  Volume1Icon,
  Volume2Icon,
} from "lucide-react";

import { EmptyMedia } from "@/components/ui/empty";

import type { DeviceButton, TouchAction } from "@/shared/screen-contracts";
import { useScreenVideo } from "../screen/use-screen-video";
import { useWorkbench } from "../use-workbench";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "@/components/ui/menu";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

type DeviceButtonConfig = {
  button: DeviceButton;
  label: string;
  icon: typeof ChevronLeftIcon;
};

const DEVICE_BUTTONS: Array<DeviceButtonConfig> = [
  { button: "back", label: "Back", icon: ChevronLeftIcon },
  { button: "home", label: "Home", icon: CircleIcon },
  { button: "app-switch", label: "Recent apps", icon: SquareIcon },
];

const VOLUME_BUTTONS: Array<DeviceButtonConfig> = [
  { button: "volume-up", label: "Volume up", icon: Volume2Icon },
  { button: "volume-down", label: "Volume down", icon: Volume1Icon },
  { button: "power", label: "Power", icon: PowerIcon },
];

export function DeviceMonitor() {
  const { devices, screens } = useWorkbench();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const moveFrameRef = useRef<number | null>(null);
  const pendingMoveRef = useRef<{ x: number; y: number } | null>(null);
  const session = devices.session;
  const video = useScreenVideo(canvasRef, screens.screen?.streamId ?? null);

  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return { x: 0.5, y: 0.5 };
    }
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };

  const sendTouch = (
    action: TouchAction,
    position: { x: number; y: number },
  ) => {
    if (
      screens.screen?.activeDisplayId === null ||
      screens.screen?.activeDisplayId === undefined
    ) {
      return;
    }
    void screens.injectTouch({
      displayId: screens.screen.activeDisplayId,
      action,
      ...position,
    });
  };

  const pointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || !video.connected) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    sendTouch("down", point(event));
  };

  const pointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    pendingMoveRef.current = point(event);
    if (moveFrameRef.current !== null) {
      return;
    }
    moveFrameRef.current = window.requestAnimationFrame(() => {
      moveFrameRef.current = null;
      const pending = pendingMoveRef.current;
      pendingMoveRef.current = null;
      if (pending !== null) {
        sendTouch("move", pending);
      }
    });
  };

  const pointerEnd = (
    action: "up" | "cancel",
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    pendingMoveRef.current = null;
    sendTouch(action, point(event));
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  useEffect(
    () => () => {
      if (moveFrameRef.current !== null) {
        window.cancelAnimationFrame(moveFrameRef.current);
      }
    },
    [],
  );

  const showCanvas =
    screens.screen?.streamId !== null && screens.screen?.streamId !== undefined;
  const displays = screens.screen?.displays ?? [];
  const activeDisplayValue =
    screens.screen?.activeDisplayId?.toString() ??
    displays[0]?.displayId.toString() ??
    "";

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-black/95">
      {displays.length > 0 && (
        <Tabs
          className="shrink-0 gap-0 flex-row"
          value={activeDisplayValue}
          onValueChange={(value) => {
            const displayId = Number(value);
            if (Number.isInteger(displayId) && displayId >= 0) {
              void screens.selectDisplay(displayId);
            }
          }}
        >
          <ScrollArea className="min-w-0 flex-1 bg-muted">
            <TabsList className="w-max min-w-full rounded-none h-8">
              {displays.map((display) => (
                <TabsTab
                  key={display.displayId}
                  value={display.displayId.toString()}
                  disabled={screens.busy}
                >
                  {display.kind === "virtual" ? (
                    <MonitorIcon className="size-3.5" />
                  ) : (
                    <SmartphoneIcon className="size-3.5" />
                  )}

                  <span>Display {display.displayId}</span>

                  <Badge size="sm" className="font-mono font-bold">
                    {display.kind}
                  </Badge>
                </TabsTab>
              ))}
            </TabsList>
          </ScrollArea>

          <Menu>
            <MenuTrigger render={<Button size="icon" variant="secondary" />}>
              <PlusIcon />
            </MenuTrigger>

            <MenuPopup align="start">
              <MenuItem>Profile</MenuItem>
              <MenuSeparator />

              <MenuGroup>
                <MenuGroupLabel>Playback</MenuGroupLabel>
                <MenuItem>Play</MenuItem>
                <MenuItem>Pause</MenuItem>
              </MenuGroup>

              <MenuSeparator />

              <MenuCheckboxItem>Shuffle</MenuCheckboxItem>
              <MenuCheckboxItem>Repeat</MenuCheckboxItem>
              <MenuCheckboxItem variant="switch">Auto save</MenuCheckboxItem>

              <MenuSeparator />

              <MenuGroup>
                <MenuGroupLabel>Sort by</MenuGroupLabel>
                <MenuRadioGroup>
                  <MenuRadioItem value="artist">Artist</MenuRadioItem>
                  <MenuRadioItem value="album">Album</MenuRadioItem>
                  <MenuRadioItem value="title">Title</MenuRadioItem>
                </MenuRadioGroup>
              </MenuGroup>

              <MenuSeparator />

              <MenuSub>
                <MenuSubTrigger>Add to playlist</MenuSubTrigger>
                <MenuSubPopup>
                  <MenuItem>Jazz</MenuItem>
                  <MenuItem>Rock</MenuItem>
                </MenuSubPopup>
              </MenuSub>
            </MenuPopup>
          </Menu>
        </Tabs>
      )}

      {!showCanvas ? (
        <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center bg-muted/30">
            <div className="flex flex-col items-center gap-3 px-6 text-center">
              <EmptyMedia variant="icon" className="mb-0">
                <VideoOffIcon aria-hidden="true" className="size-4" />
              </EmptyMedia>

              <div className="text-xs font-medium text-foreground">
                {showCanvas
                  ? "Waiting for scrcpy video"
                  : "Video stream not connected"}
              </div>

              <p className="max-w-64 text-[11px] leading-4 text-muted-foreground">
                {video.error ??
                  (session?.state === "connected"
                    ? "Open Screens to select a display. The main display starts automatically after connection."
                    : "Connect an Android device to start monitoring its main display.")}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden">
          <canvas
            aria-label="Live Android display"
            className="h-auto max-h-full w-auto max-w-full touch-none bg-black"
            onPointerCancel={(event) => pointerEnd("cancel", event)}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={(event) => pointerEnd("up", event)}
            ref={canvasRef}
          />

          {!video.connected && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/30">
              <div className="flex flex-col items-center gap-3 px-6 text-center">
                <EmptyMedia variant="icon" className="mb-0">
                  <VideoOffIcon aria-hidden="true" className="size-4" />
                </EmptyMedia>

                <div className="text-xs font-medium text-foreground">
                  Waiting for scrcpy video
                </div>

                <p className="max-w-64 text-[11px] leading-4 text-muted-foreground">
                  {video.error ?? "The video decoder is starting."}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-1 rounded-md bg-muted w-full">
        {DEVICE_BUTTONS.map(({ button, label, icon: Icon }) => (
          <Button
            aria-label={label}
            disabled={screens.busy}
            key={button}
            onClick={() => void screens.pressButton(button)}
            size="icon-sm"
            title={label}
            variant="secondary"
          >
            <Icon className="size-3" />
          </Button>
        ))}

        <div className="flex-1" />

        {VOLUME_BUTTONS.map(({ button, label, icon: Icon }) => (
          <Button
            aria-label={label}
            disabled={screens.busy}
            key={button}
            onClick={() => void screens.pressButton(button)}
            size="icon-sm"
            title={label}
            variant="secondary"
          >
            <Icon className="size-3" />
          </Button>
        ))}
      </div>
    </div>
  );
}
