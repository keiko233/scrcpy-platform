import { useCallback, useEffect, useRef, useState } from "react";

import type {
  CreateVirtualDisplayInput,
  DeviceButton,
  InjectScreenTouchInput,
  ScreenOperationResult,
  ScreenSessionDto,
} from "@/shared/screen-contracts";
import type { DeviceManager } from "../device/use-devices";

const SCREEN_POLL_MS = 1000;

export interface ScreenManager {
  screen: ScreenSessionDto | null;
  busy: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  selectDisplay: (displayId: number) => Promise<void>;
  createVirtualDisplay: (input: CreateVirtualDisplayInput) => Promise<void>;
  destroyVirtualDisplay: () => Promise<void>;
  pressButton: (button: DeviceButton) => Promise<void>;
  injectTouch: (input: InjectScreenTouchInput) => Promise<void>;
  clearError: () => void;
}

export function useScreens(devices: DeviceManager): ScreenManager {
  const [screen, setScreen] = useState<ScreenSessionDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationCountRef = useRef(0);
  const autoStartedTargetRef = useRef<string | null>(null);

  const applyResult = useCallback((result: ScreenOperationResult): boolean => {
    if (result.status === "ok") {
      setScreen(result.screen);
      setError(null);
      return true;
    }
    setError(result.error.message);
    return false;
  }, []);

  const run = useCallback(
    async (operation: () => Promise<ScreenOperationResult>): Promise<boolean> => {
      operationCountRef.current += 1;
      setBusy(true);
      try {
        return applyResult(await operation());
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        return false;
      } finally {
        operationCountRef.current -= 1;
        if (operationCountRef.current === 0) {
          setBusy(false);
        }
      }
    },
    [applyResult],
  );

  const refresh = useCallback(async () => {
    await run(() => window.androidPlatform.refreshScreens());
  }, [run]);

  const selectDisplay = useCallback(
    async (displayId: number) => {
      await run(() => window.androidPlatform.startScreen({ displayId }));
    },
    [run],
  );

  const createVirtualDisplay = useCallback(
    async (input: CreateVirtualDisplayInput) => {
      await run(() => window.androidPlatform.createVirtualScreen(input));
    },
    [run],
  );

  const destroyVirtualDisplay = useCallback(async () => {
    await run(() => window.androidPlatform.destroyVirtualScreen());
  }, [run]);

  const pressButton = useCallback(
    async (button: DeviceButton) => {
      await run(() => window.androidPlatform.pressDeviceButton({ button }));
    },
    [run],
  );

  const injectTouch = useCallback(
    async (input: InjectScreenTouchInput) => {
      const result = await window.androidPlatform.injectScreenTouch(input);
      if (result.status === "error") {
        setError(result.error.message);
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const current = await window.androidPlatform.getScreenSession();
        if (!cancelled) {
          setScreen(current);
          if (current.errorMessage !== null) {
            setError(current.errorMessage);
          }
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    };
    void load();
    const interval = window.setInterval(() => void load(), SCREEN_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const session = devices.session;
    if (session?.state !== "connected" || session.serial === null) {
      autoStartedTargetRef.current = null;
      return;
    }
    const target = `${session.sessionId}:${session.serial}`;
    if (autoStartedTargetRef.current === target) {
      return;
    }
    autoStartedTargetRef.current = target;
    void (async () => {
      const refreshed = await window.androidPlatform.refreshScreens();
      if (!applyResult(refreshed) || refreshed.status !== "ok") {
        return;
      }
      if (refreshed.screen.streamId !== null) {
        return;
      }
      const main =
        refreshed.screen.displays.find((display) => display.primary) ??
        refreshed.screen.displays.find((display) => display.displayId === 0) ??
        refreshed.screen.displays[0];
      if (main !== undefined) {
        applyResult(
          await window.androidPlatform.startScreen({
            displayId: main.displayId,
          }),
        );
      }
    })().catch((cause) => {
      setError(cause instanceof Error ? cause.message : String(cause));
    });
  }, [applyResult, devices.session]);

  const clearError = useCallback(() => setError(null), []);

  return {
    screen,
    busy,
    error,
    refresh,
    selectDisplay,
    createVirtualDisplay,
    destroyVirtualDisplay,
    pressButton,
    injectTouch,
    clearError,
  };
}
