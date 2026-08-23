import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { toastManager } from "@/components/ui/toast";
import {
  screenSessionQueryKey,
  useScreenSession,
} from "@/hooks/query/use-screen-session";
import type {
  CreateVirtualDisplayInput,
  DeviceButton,
  InjectScreenTouchInput,
  ScreenOperationResult,
  ScreenSessionDto,
} from "@/shared/screen-contracts";
import { m } from "@/paraglide/messages.js";
import type { DeviceManager } from "../device/use-devices";

export interface ScreenManager {
  screen: ScreenSessionDto | null;
  busy: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  selectDisplay: (displayId: number) => Promise<void>;
  createVirtualDisplay: (input: CreateVirtualDisplayInput) => Promise<boolean>;
  destroyVirtualDisplay: (displayId: number) => Promise<void>;
  pressButton: (button: DeviceButton) => Promise<void>;
  injectTouch: (input: InjectScreenTouchInput) => Promise<void>;
  clearError: () => void;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function useScreens(devices: DeviceManager): ScreenManager {
  const queryClient = useQueryClient();
  const sessionQuery = useScreenSession();
  const [busy, setBusy] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const operationCountRef = useRef(0);
  const autoStartedTargetRef = useRef<string | null>(null);

  const screen = sessionQuery.data ?? null;
  const screenError = sessionQuery.isError
    ? errorMessage(sessionQuery.error)
    : screen !== null && screen.errorMessage !== null
      ? screen.errorMessage
      : null;
  const error = operationError ?? screenError;

  const applyResult = useCallback(
    (result: ScreenOperationResult, notify = false): boolean => {
      if (result.status === "ok") {
        queryClient.setQueryData<ScreenSessionDto>(
          screenSessionQueryKey,
          result.screen,
        );
        setOperationError(null);
        return true;
      }
      setOperationError(result.error.message);
      if (notify) {
        toastManager.add({
          type: "error",
          title: m.screen_operation_failed_title(),
          description: result.error.message,
        });
      }
      return false;
    },
    [queryClient],
  );

  const run = useCallback(
    async (operation: () => Promise<ScreenOperationResult>): Promise<boolean> => {
      operationCountRef.current += 1;
      setBusy(true);
      try {
        return applyResult(await operation(), true);
      } catch (cause) {
        const message = errorMessage(cause);
        setOperationError(message);
        toastManager.add({
          type: "error",
          title: m.screen_operation_failed_title(),
          description: message,
        });
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
      return await run(() => window.androidPlatform.createVirtualScreen(input));
    },
    [run],
  );

  const destroyVirtualDisplay = useCallback(async (displayId: number) => {
    await run(() => window.androidPlatform.destroyVirtualScreen({ displayId }));
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
        setOperationError(result.error.message);
      }
    },
    [],
  );

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
      setOperationError(errorMessage(cause));
    });
  }, [applyResult, devices.session]);

  const clearError = useCallback(() => setOperationError(null), []);

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
