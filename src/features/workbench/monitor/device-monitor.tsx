import {
  useCallback,
  useState,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ChevronLeftIcon,
  CircleIcon,
  PowerIcon,
  SquareIcon,
  VideoOffIcon,
  Volume1Icon,
  Volume2Icon,
} from "lucide-react";

import { EmptyMedia } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { DeviceButton, TouchAction } from "@/shared/screen-contracts";
import { useScreenVideo } from "../screen/use-screen-video";
import { useWorkbench } from "../use-workbench";
import {
  screenPointFromNormalized,
  screenRegionFromDrag,
  type NormalizedScreenPoint,
} from "./screen-region-selection";

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

interface ScreenRegionSelectionDraft {
  start: NormalizedScreenPoint;
  current: NormalizedScreenPoint;
  startClient: { x: number; y: number };
  currentClient: { x: number; y: number };
}

export function DeviceMonitor() {
  const { devices, screens, screenRegionSelection, screenPointSelection } =
    useWorkbench();
  const {
    nodeId: screenRegionNodeId,
    cancel: cancelScreenRegionSelection,
    complete: completeScreenRegionSelection,
  } = screenRegionSelection;
  const {
    nodeId: screenPointNodeId,
    cancel: cancelScreenPointSelection,
    complete: completeScreenPointSelection,
  } = screenPointSelection;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const moveFrameRef = useRef<number | null>(null);
  const pendingMoveRef = useRef<{ x: number; y: number } | null>(null);
  const selectionDraftRef = useRef<ScreenRegionSelectionDraft | null>(null);
  const [selectionDraft, setSelectionDraft] =
    useState<ScreenRegionSelectionDraft | null>(null);
  const session = devices.session;
  const video = useScreenVideo(canvasRef, screens.screen?.streamId ?? null);

  const updateSelectionDraft = useCallback(
    (draft: ScreenRegionSelectionDraft | null) => {
      selectionDraftRef.current = draft;
      setSelectionDraft(draft);
    },
    [],
  );

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
    const position = point(event);
    if (screenRegionNodeId !== null) {
      updateSelectionDraft({
        start: position,
        current: position,
        startClient: { x: event.clientX, y: event.clientY },
        currentClient: { x: event.clientX, y: event.clientY },
      });
      return;
    }
    if (screenPointNodeId !== null) {
      return;
    }
    sendTouch("down", position);
  };

  const pointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    if (screenPointNodeId !== null) {
      return;
    }
    if (selectionDraftRef.current !== null) {
      if (screenRegionNodeId === null) {
        updateSelectionDraft(null);
        return;
      }
      const current = point(event);
      updateSelectionDraft({
        ...selectionDraftRef.current,
        current,
        currentClient: { x: event.clientX, y: event.clientY },
      });
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
    const end = point(event);
    event.currentTarget.releasePointerCapture(event.pointerId);
    const draft = selectionDraftRef.current;
    if (draft !== null) {
      updateSelectionDraft(null);
      if (screenRegionNodeId === null) {
        return;
      }
      if (action === "cancel") {
        cancelScreenRegionSelection();
        return;
      }
      completeScreenRegionSelection(
        screenRegionFromDrag(
          draft.start,
          end,
          event.currentTarget.width,
          event.currentTarget.height,
        ),
      );
      return;
    }
    if (screenPointNodeId !== null) {
      if (action === "cancel") {
        cancelScreenPointSelection();
        return;
      }
      completeScreenPointSelection(
        screenPointFromNormalized(
          end,
          event.currentTarget.width,
          event.currentTarget.height,
        ),
      );
      return;
    }
    sendTouch(action, end);
  };

  useEffect(() => {
    if (screenRegionNodeId === null && screenPointNodeId === null) {
      return;
    }
    pendingMoveRef.current = null;
    if (moveFrameRef.current !== null) {
      window.cancelAnimationFrame(moveFrameRef.current);
      moveFrameRef.current = null;
    }
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        updateSelectionDraft(null);
        cancelScreenRegionSelection();
        cancelScreenPointSelection();
      }
    };
    window.addEventListener("keydown", cancelOnEscape);
    return () => window.removeEventListener("keydown", cancelOnEscape);
  }, [
    cancelScreenPointSelection,
    cancelScreenRegionSelection,
    screenPointNodeId,
    screenRegionNodeId,
    updateSelectionDraft,
  ]);

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

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-black/95">
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
            className={cn(
              "h-auto max-h-full w-auto max-w-full touch-none bg-black",
              (screenRegionNodeId !== null || screenPointNodeId !== null) &&
                "cursor-crosshair",
            )}
            onPointerCancel={(event) => pointerEnd("cancel", event)}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={(event) => pointerEnd("up", event)}
            ref={canvasRef}
          />

          {screenRegionNodeId !== null && video.connected && (
            <div className="pointer-events-none absolute top-2 z-20 rounded-md border border-amber-400/60 bg-black/75 px-2 py-1 text-[11px] text-white shadow-sm">
              Drag over the screen to select a region · Esc to cancel
            </div>
          )}

          {screenPointNodeId !== null && video.connected && (
            <div className="pointer-events-none absolute top-2 z-20 rounded-md border border-sky-400/60 bg-black/75 px-2 py-1 text-[11px] text-white shadow-sm">
              Click the screen to select a point · Esc to cancel
            </div>
          )}

          {screenRegionNodeId !== null && selectionDraft !== null && (
            <div
              className="pointer-events-none fixed z-50 border-2 border-amber-400 bg-amber-400/15 shadow-[0_0_0_1px_rgba(0,0,0,0.65)]"
              style={{
                left: Math.min(
                  selectionDraft.startClient.x,
                  selectionDraft.currentClient.x,
                ),
                top: Math.min(
                  selectionDraft.startClient.y,
                  selectionDraft.currentClient.y,
                ),
                width: Math.abs(
                  selectionDraft.currentClient.x -
                    selectionDraft.startClient.x,
                ),
                height: Math.abs(
                  selectionDraft.currentClient.y -
                    selectionDraft.startClient.y,
                ),
              }}
            />
          )}

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

      <div className="flex w-full gap-1 rounded-md bg-muted">
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
