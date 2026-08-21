import { useCallback, useEffect, useRef, useState } from "react";
import useInterval from "react-use/lib/useInterval";

import type {
  AdbDeviceDto,
  ConnectDeviceFailure,
  DeviceSessionDto,
} from "@/shared/device-contracts";

const SESSION_POLL_MS = 2000;

export interface DeviceManager {
  devices: AdbDeviceDto[];
  session: DeviceSessionDto | null;
  sessionLoaded: boolean;
  selectedTransportId: string | null;
  loadingDevices: boolean;
  connecting: boolean;
  disconnecting: boolean;
  listError: string | null;
  sessionError: string | null;
  setSelectedTransportId: (transportId: string) => void;
  refresh: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  clearError: () => void;
  clearSessionError: () => void;
}

function describeConnectFailure(error: ConnectDeviceFailure): string {
  switch (error) {
    case "server-unavailable":
      return "ADB server is not reachable. Make sure the ADB server is running.";
    case "device-missing":
      return "The selected device disappeared before the connection could be established.";
    case "device-not-ready":
      return "The device is not ready to connect (it may be unauthorized or offline).";
    case "session-busy":
      return "Another connection operation is already in progress.";
    case "connection-failed":
      return "The connection failed. Check the device and ADB server.";
  }
}

export function useDevices(): DeviceManager {
  const [devices, setDevices] = useState<AdbDeviceDto[]>([]);
  const [session, setSession] = useState<DeviceSessionDto | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [selectedTransportId, setSelectedTransportId] = useState<string | null>(
    null,
  );
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const sessionJsonRef = useRef<string>("");

  const applySessionSnapshot = useCallback((current: DeviceSessionDto) => {
    const json = JSON.stringify(current);
    if (json === sessionJsonRef.current) {
      return;
    }
    sessionJsonRef.current = json;
    setSession(current);
    setSessionError(
      current.errorMessage !== null && current.errorMessage.length > 0
        ? current.errorMessage
        : null,
    );
  }, []);

  const refreshDevices = useCallback(async () => {
    setLoadingDevices(true);
    try {
      const result = await window.androidPlatform.listDevices();
      if (result.status === "ok") {
        setDevices(result.devices);
        setListError(null);
      } else {
        setDevices([]);
        setListError(
          "Could not reach the ADB server. Start the ADB server and try again.",
        );
      }
    } catch (cause) {
      setDevices([]);
      setListError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const current = await window.androidPlatform.getDeviceSession();
      applySessionSnapshot(current);
    } catch (cause) {
      setSessionError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [applySessionSnapshot]);

  const connect = useCallback(async () => {
    if (selectedTransportId === null) {
      return;
    }
    setConnecting(true);
    setSessionError(null);
    try {
      const result = await window.androidPlatform.connectDevice({
        transportId: selectedTransportId,
      });
      if (result.status === "ok") {
        setSession(result.session);
      } else {
        setSessionError(describeConnectFailure(result.error));
      }
    } catch (cause) {
      setSessionError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setConnecting(false);
      void refreshSession();
    }
  }, [selectedTransportId, refreshSession]);

  const disconnect = useCallback(async () => {
    setDisconnecting(true);
    setSessionError(null);
    try {
      const result = await window.androidPlatform.disconnectDevice();
      if (result.status === "ok") {
        setSession(result.session);
      } else {
        setSessionError("Disconnect failed. The device may already be gone.");
      }
    } catch (cause) {
      setSessionError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setDisconnecting(false);
      void refreshSession();
    }
  }, [refreshSession]);

  useEffect(() => {
    let cancelled = false;
    void window.androidPlatform
      .listDevices()
      .then((result) => {
        if (cancelled) {
          return;
        }
        setDevices(result.status === "ok" ? result.devices : []);
        setListError(
          result.status === "ok"
            ? null
            : "Could not reach the ADB server. Start the ADB server and try again.",
        );
      })
      .catch((cause) => {
        if (!cancelled) {
          setListError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    void window.androidPlatform
      .getDeviceSession()
      .then((current) => {
        if (!cancelled) {
          applySessionSnapshot(current);
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setSessionError(
            cause instanceof Error ? cause.message : String(cause),
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSessionLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [applySessionSnapshot]);

  useInterval(() => void refreshSession(), SESSION_POLL_MS);

  const clearError = useCallback(() => setListError(null), []);
  const clearSessionError = useCallback(() => setSessionError(null), []);

  return {
    devices,
    session,
    sessionLoaded,
    selectedTransportId,
    loadingDevices,
    connecting,
    disconnecting,
    listError,
    sessionError,
    setSelectedTransportId,
    refresh: refreshDevices,
    connect,
    disconnect,
    clearError,
    clearSessionError,
  };
}
