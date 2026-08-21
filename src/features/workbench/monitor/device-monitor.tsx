import {
  useState,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useForm } from "@tanstack/react-form";
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
  XIcon,
} from "lucide-react";

import { EmptyMedia } from "@/components/ui/empty";

import {
  CreateVirtualDisplayInputSchema,
  type DeviceButton,
  type TouchAction,
} from "@/shared/screen-contracts";
import { useInstalledApps } from "../device/use-installed-apps";
import { useScreenVideo } from "../screen/use-screen-video";
import { useWorkbench } from "../use-workbench";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuPopup,
  MenuTrigger,
} from "@/components/ui/menu";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxPopup,
  ComboboxPrimitive,
  ComboboxStatus,
} from "@/components/ui/combobox";
import { ScrollArea } from "@/components/ui/scroll-area";

type VirtualDisplayFormValues = {
  width: string;
  height: string;
  dpi: string;
  packageName: string;
};

const DEFAULT_VIRTUAL_DISPLAY_VALUES: VirtualDisplayFormValues = {
  width: "1280",
  height: "720",
  dpi: "320",
  packageName: "",
};

function VirtualDisplayMenu({ connected }: { connected: boolean }) {
  const { devices, screens } = useWorkbench();
  const [open, setOpen] = useState(false);
  const [showSystemApps, setShowSystemApps] = useState(false);
  const appsQuery = useInstalledApps(open && connected, devices.session?.sessionId ?? null);
  const allApps = appsQuery.data ?? [];
  const apps = showSystemApps
    ? allApps
    : allApps.filter((app) => !app.system);
  const form = useForm({
    defaultValues: DEFAULT_VIRTUAL_DISPLAY_VALUES,
    onSubmit: async ({ value }) => {
      const result = CreateVirtualDisplayInputSchema.safeParse({
        width: Number.parseInt(value.width, 10),
        height: Number.parseInt(value.height, 10),
        dpi: Number.parseInt(value.dpi, 10),
        packageName: value.packageName.trim() || undefined,
      });
      if (!result.success) {
        return;
      }
      await screens.createVirtualDisplay(result.data);
      setOpen(false);
    },
  });

  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger render={<Button size="icon" variant="secondary" />}>
        <PlusIcon />
      </MenuTrigger>

      <MenuPopup align="start" className="w-64 p-2">
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <div className="flex items-center gap-2 text-xs font-medium">
            <PlusIcon className="size-3.5" />
            Virtual display
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <form.Field name="width">
              {(field) => (
                <label className="grid gap-1 text-[10px] text-muted-foreground">
                  Width
                  <Input
                    nativeInput
                    max={7680}
                    min={320}
                    onChange={(event) => field.handleChange(event.target.value)}
                    size="sm"
                    type="number"
                    value={field.state.value}
                  />
                </label>
              )}
            </form.Field>
            <form.Field name="height">
              {(field) => (
                <label className="grid gap-1 text-[10px] text-muted-foreground">
                  Height
                  <Input
                    nativeInput
                    max={7680}
                    min={320}
                    onChange={(event) => field.handleChange(event.target.value)}
                    size="sm"
                    type="number"
                    value={field.state.value}
                  />
                </label>
              )}
            </form.Field>
            <form.Field name="dpi">
              {(field) => (
                <label className="grid gap-1 text-[10px] text-muted-foreground">
                  DPI
                  <Input
                    nativeInput
                    max={960}
                    min={72}
                    onChange={(event) => field.handleChange(event.target.value)}
                    size="sm"
                    type="number"
                    value={field.state.value}
                  />
                </label>
              )}
            </form.Field>
          </div>

          <form.Field name="packageName">
            {(field) => {
              const selectedApp =
                allApps.find((app) => app.packageName === field.state.value) ?? null;
              const query = field.state.value.trim().toLowerCase();
              const visibleApps = apps.filter(
                (app) =>
                  query.length === 0 ||
                  app.name.toLowerCase().includes(query) ||
                  app.packageName.toLowerCase().includes(query),
              );
              return (
                <div className="grid gap-1">
                  <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                    <span>App package (optional)</span>
                    <label className="flex items-center gap-1.5">
                      <Checkbox
                        checked={showSystemApps}
                        onCheckedChange={(checked) =>
                          setShowSystemApps(checked === true)
                        }
                      />
                      Show system apps
                    </label>
                  </div>
                  <Combobox
                    autoComplete="none"
                    inputValue={field.state.value}
                    itemToStringLabel={(app) => app.name}
                    itemToStringValue={(app) => app.packageName}
                    items={visibleApps}
                    onInputValueChange={(value) => field.handleChange(value)}
                    onValueChange={(app) => field.handleChange(app?.packageName ?? "")}
                    value={selectedApp}
                  >
                    <ComboboxInput
                      placeholder={appsQuery.isPending ? "Loading apps..." : "com.example.app"}
                      showClear
                      size="sm"
                    />
                    <ComboboxPopup className="w-72">
                      <ComboboxStatus>
                        {appsQuery.isPending
                          ? "Loading installed apps..."
                          : apps.length === 0 && !showSystemApps && allApps.length > 0
                            ? "No user apps found. Enable system apps to see more."
                            : `${apps.length} apps`}
                      </ComboboxStatus>
                      <ScrollArea
                        className="max-h-64"
                        overscrollContain
                        scrollFade
                        scrollbarGutter
                      >
                        <ComboboxPrimitive.List className="not-empty:px-1 not-empty:py-1">
                          {visibleApps.length === 0 && (
                            <ComboboxEmpty>No apps found.</ComboboxEmpty>
                          )}
                          {visibleApps.map((item) => (
                            <ComboboxItem key={item.packageName} value={item}>
                              <div className="flex min-w-0 items-center gap-2">
                                {item.iconUrl !== null ? (
                                  <img
                                    alt=""
                                    className="size-5 rounded-md object-cover"
                                    src={item.iconUrl}
                                  />
                                ) : (
                                  <SmartphoneIcon className="size-4 text-muted-foreground" />
                                )}
                                <span className="min-w-0">
                                  <span className="block truncate text-xs font-medium">
                                    {item.name}
                                  </span>
                                  <span className="block truncate text-[10px] text-muted-foreground">
                                    {item.packageName}
                                  </span>
                                </span>
                                {item.system && (
                                  <Badge size="sm" variant="outline">System</Badge>
                                )}
                              </div>
                            </ComboboxItem>
                          ))}
                        </ComboboxPrimitive.List>
                      </ScrollArea>
                    </ComboboxPopup>
                  </Combobox>
                </div>
              );
            }}
          </form.Field>

          <div>
            <Button
              className="flex-1"
              disabled={
                !connected || screens.screen?.ownedVirtualDisplayId !== null
              }
              loading={screens.busy}
              size="xs"
              type="submit"
            >
              Create and open
            </Button>
          </div>
        </form>
      </MenuPopup>
    </Menu>
  );
}

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

                  {display.ownedBySession && (
                    <span
                      aria-label="Destroy virtual display"
                      className="ml-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      onClick={(event) => {
                        event.stopPropagation();
                        event.preventDefault();
                        void screens.destroyVirtualDisplay();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.stopPropagation();
                          event.preventDefault();
                          void screens.destroyVirtualDisplay();
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      title="Destroy virtual display"
                    >
                      <XIcon className="size-3.5" />
                    </span>
                  )}
                </TabsTab>
              ))}
            </TabsList>
          </ScrollArea>

          <VirtualDisplayMenu
            connected={devices.session?.state === "connected"}
          />
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
