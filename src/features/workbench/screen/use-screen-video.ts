import { useEffect, useState, type RefObject } from "react";

import type {
  ScrcpyMediaStreamPacket,
  ScrcpyVideoCodecId,
} from "@yume-chan/scrcpy";
import {
  BitmapVideoFrameRenderer,
  WebCodecsVideoDecoder,
  WebGLVideoFrameRenderer,
} from "@yume-chan/scrcpy-decoder-webcodecs";
import type { WritableStreamDefaultWriter } from "@yume-chan/stream-extra";

import { SCREEN_VIDEO_WINDOW_EVENT } from "@/shared/electron-api";
import type { ScreenVideoMessage } from "@/shared/screen-contracts";

export interface ScreenVideoState {
  connected: boolean;
  width: number;
  height: number;
  error: string | null;
}

const INITIAL_STATE: ScreenVideoState = {
  connected: false,
  width: 0,
  height: 0,
  error: null,
};

export function useScreenVideo(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  streamId: string | null,
): ScreenVideoState {
  const [state, setState] = useState(INITIAL_STATE);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (streamId === null || canvas === null) {
      setState(INITIAL_STATE);
      return;
    }

    let disposed = false;
    let port: MessagePort | null = null;
    let decoder: WebCodecsVideoDecoder | null = null;
    let writer: WritableStreamDefaultWriter<ScrcpyMediaStreamPacket> | null = null;
    let removeSizeListener: (() => void) | null = null;

    const disposeDecoder = () => {
      removeSizeListener?.();
      removeSizeListener = null;
      void writer?.abort().catch(() => undefined);
      writer = null;
      decoder?.dispose();
      decoder = null;
    };

    const receiveVideoMessage = (message: ScreenVideoMessage) => {
      if (disposed || message.streamId !== streamId) {
        return;
      }
      if (message.type === "metadata") {
        disposeDecoder();
        try {
          const renderer = WebGLVideoFrameRenderer.isSupported
            ? new WebGLVideoFrameRenderer(canvas)
            : new BitmapVideoFrameRenderer(canvas);
          decoder = new WebCodecsVideoDecoder({
            codec: message.codec as ScrcpyVideoCodecId,
            renderer,
          });
          writer = decoder.writable.getWriter();
          removeSizeListener = decoder.sizeChanged(({ width, height }) => {
            setState({ connected: true, width, height, error: null });
          });
          setState((current) => ({ ...current, connected: true, error: null }));
        } catch (cause) {
          setState({
            ...INITIAL_STATE,
            error: cause instanceof Error ? cause.message : String(cause),
          });
        }
        return;
      }
      if (message.type === "packet") {
        void writer?.write(message.packet).catch((cause) => {
          setState((current) => ({
            ...current,
            connected: false,
            error: cause instanceof Error ? cause.message : String(cause),
          }));
        });
        return;
      }
      setState({
        ...INITIAL_STATE,
        error: message.reason ?? "The screen stream stopped.",
      });
      disposeDecoder();
    };

    const receivePort = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; streamId?: unknown } | null;
      if (
        data?.type !== SCREEN_VIDEO_WINDOW_EVENT ||
        data.streamId !== streamId
      ) {
        return;
      }
      const nextPort = event.ports[0];
      if (nextPort === undefined) {
        setState({ ...INITIAL_STATE, error: "Electron did not transfer a video port." });
        return;
      }
      port?.close();
      port = nextPort;
      nextPort.onmessage = (portEvent: MessageEvent<ScreenVideoMessage>) => {
        receiveVideoMessage(portEvent.data);
      };
      nextPort.start();
    };

    window.addEventListener("message", receivePort);
    window.androidPlatform.requestScreenVideo({ streamId });

    return () => {
      disposed = true;
      window.removeEventListener("message", receivePort);
      port?.close();
      disposeDecoder();
    };
  }, [canvasRef, streamId]);

  return state;
}
