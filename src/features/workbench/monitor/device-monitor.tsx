import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { MonitorIcon, VideoOffIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyMedia } from "@/components/ui/empty";

import type { TouchAction } from "@/shared/screen-contracts";
import { useScreenVideo } from "../screen/use-screen-video";
import { useWorkbench } from "../use-workbench";

const STATE_VARIANT: Record<string, "outline" | "success" | "warning" | "error"> =
  {
    disconnected: "outline",
    idle: "outline",
    starting: "warning",
    streaming: "success",
    switching: "warning",
    error: "error",
  };

export function DeviceMonitor() {
  const { devices, screens } = useWorkbench();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const moveFrameRef = useRef<number | null>(null);
  const pendingMoveRef = useRef<{ x: number; y: number } | null>(null);
  const session = devices.session;
  const screen = screens.screen;
  const video = useScreenVideo(canvasRef, screen?.streamId ?? null);

  const state = screen?.state ?? session?.state ?? "disconnected";
  const variant = STATE_VARIANT[state] ?? "outline";

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

  const sendTouch = (action: TouchAction, position: { x: number; y: number }) => {
    if (screen?.activeDisplayId === null || screen?.activeDisplayId === undefined) {
      return;
    }
    void screens.injectTouch({
      displayId: screen.activeDisplayId,
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

  const showCanvas = screen?.streamId !== null && screen?.streamId !== undefined;

  return (
    <div className="wb-panel">
      <div className="wb-panel-header">
        <MonitorIcon className="size-3.5" />
        Monitor
        {screen?.activeDisplayId !== null && screen?.activeDisplayId !== undefined && (
          <span className="font-mono text-[10px] text-muted-foreground">
            display {screen.activeDisplayId}
          </span>
        )}
        <div className="ms-auto flex items-center gap-1.5">
          <Badge size="sm" variant={variant}>
            {state}
          </Badge>
        </div>
      </div>

      <div className="wb-panel-body gap-2 p-2">
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border bg-black/95">
          {showCanvas && (
            <canvas
              aria-label="Live Android display"
              className="h-auto max-h-full w-auto max-w-full touch-none bg-black"
              onPointerCancel={(event) => pointerEnd("cancel", event)}
              onPointerDown={pointerDown}
              onPointerMove={pointerMove}
              onPointerUp={(event) => pointerEnd("up", event)}
              ref={canvasRef}
            />
          )}
          {(!showCanvas || !video.connected) && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/30">
              <div className="flex flex-col items-center gap-3 px-6 text-center">
                <EmptyMedia variant="icon" className="mb-0">
                  <VideoOffIcon aria-hidden="true" className="size-4" />
                </EmptyMedia>
                <div className="text-xs font-medium text-foreground">
                  {showCanvas ? "Waiting for scrcpy video" : "Video stream not connected"}
                </div>
                <p className="max-w-64 text-[11px] leading-4 text-muted-foreground">
                  {video.error ??
                    (session?.state === "connected"
                      ? "Open Screens to select a display. The main display starts automatically after connection."
                      : "Connect an Android device to start monitoring its main display.")}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-[11px]">
          <span className="text-muted-foreground">Session</span>
          <span className="truncate text-right font-mono" title={session?.sessionId}>
            {session?.sessionId ?? "—"}
          </span>
          <span className="text-muted-foreground">Device</span>
          <span
            className="truncate text-right font-mono"
            title={session?.serial ?? undefined}
          >
            {session?.serial ?? "—"}
          </span>
          <span className="text-muted-foreground">Video</span>
          <span className="text-right font-mono">
            {video.width > 0 && video.height > 0
              ? `${video.width}×${video.height}`
              : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
