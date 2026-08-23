import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  deviceListQueryKey,
  useDeviceList,
} from "@/hooks/query/use-device-list";
import {
  deviceSessionQueryKey,
  useDeviceSession,
} from "@/hooks/query/use-device-session";
import type {
  AdbDeviceDto,
  ConnectDeviceFailure,
  DeviceSessionDto,
  WirelessOperationFailure,
} from "@/shared/device-contracts";

export interface DeviceManager {
  devices: AdbDeviceDto[];
  session: DeviceSessionDto | null;
  sessionLoaded: boolean;
  selectedTransportId: string | null;
  loadingDevices: boolean;
  connecting: boolean;
  disconnecting: boolean;
  wirelessBusy: boolean;
  listError: string | null;
  sessionError: string | null;
  setSelectedTransportId: (transportId: string) => void;
  refresh: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  pairWireless: (address: string, password: string) => Promise<void>;
  connectWireless: (address: string) => Promise<void>;
  disconnectWireless: (address: string) => Promise<void>;
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

const SERVER_UNAVAILABLE_MESSAGE =
  "Could not reach the ADB server. Start the ADB server and try again.";

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function describeWirelessFailure(
  error: WirelessOperationFailure,
  message: string,
): string {
  const prefix = {
    "server-unavailable": "ADB server is not reachable.",
    unauthorized: "Wireless debugging rejected the pairing or connection.",
    "already-connected": "The wireless device is already connected.",
    "network-error": "The wireless device could not be reached.",
    "operation-failed": "The wireless ADB operation failed.",
  }[error];
  return message.length > 0 ? `${prefix} ${message}` : prefix;
}

export function useDevices(): DeviceManager {
  const queryClient = useQueryClient();
  const devicesQuery = useDeviceList();
  const sessionQuery = useDeviceSession();
  const [selectedTransportId, setSelectedTransportId] = useState<string | null>(
    null,
  );
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const sessionJsonRef = useRef<string>("");

  const devices = devicesQuery.data?.status === "ok"
    ? devicesQuery.data.devices
    : [];
  const session = sessionQuery.data ?? null;
  const loadingDevices = devicesQuery.isFetching;
  const sessionLoaded = !sessionQuery.isPending;

  useEffect(() => {
    if (devicesQuery.isError) {
      setListError(errorMessage(devicesQuery.error));
      return;
    }
    if (devicesQuery.data === undefined) {
      return;
    }
    setListError(
      devicesQuery.data.status === "error" ? SERVER_UNAVAILABLE_MESSAGE : null,
    );
  }, [devicesQuery.isError, devicesQuery.error, devicesQuery.data]);

  useEffect(() => {
    if (session === null) {
      return;
    }
    const json = JSON.stringify(session);
    if (json === sessionJsonRef.current) {
      return;
    }
    sessionJsonRef.current = json;
    setSessionError(
      session.errorMessage !== null && session.errorMessage.length > 0
        ? session.errorMessage
        : null,
    );
  }, [session]);

  const connectMutation = useMutation({
    mutationFn: (transportId: string) =>
      window.androidPlatform.connectDevice({ transportId }),
    onSuccess: (result) => {
      if (result.status === "ok") {
        queryClient.setQueryData<DeviceSessionDto>(
          deviceSessionQueryKey,
          result.session,
        );
      } else {
        setSessionError(describeConnectFailure(result.error));
      }
    },
    onError: (cause) => setSessionError(errorMessage(cause)),
    onSettled: () =>
      void queryClient.invalidateQueries({
        queryKey: deviceSessionQueryKey,
      }),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => window.androidPlatform.disconnectDevice(),
    onSuccess: (result) => {
      if (result.status === "ok") {
        queryClient.setQueryData<DeviceSessionDto>(
          deviceSessionQueryKey,
          result.session,
        );
      } else {
        setSessionError("Disconnect failed. The device may already be gone.");
      }
    },
    onError: (cause) => setSessionError(errorMessage(cause)),
    onSettled: () =>
      void queryClient.invalidateQueries({
        queryKey: deviceSessionQueryKey,
      }),
  });

  const pairWirelessMutation = useMutation({
    mutationFn: (input: { address: string; password: string }) =>
      window.androidPlatform.pairWirelessDevice(input),
    onSuccess: (result) => {
      if (result.status === "error") {
        setSessionError(describeWirelessFailure(result.error, result.message));
      }
    },
    onSettled: () =>
      void queryClient.invalidateQueries({ queryKey: deviceListQueryKey }),
  });

  const connectWirelessMutation = useMutation({
    mutationFn: (address: string) =>
      window.androidPlatform.connectWirelessDevice({ address }),
    onSuccess: (result) => {
      if (result.status === "error") {
        setSessionError(describeWirelessFailure(result.error, result.message));
      }
    },
    onSettled: () =>
      void queryClient.invalidateQueries({ queryKey: deviceListQueryKey }),
  });

  const disconnectWirelessMutation = useMutation({
    mutationFn: (address: string) =>
      window.androidPlatform.disconnectWirelessDevice({ address }),
    onSuccess: (result) => {
      if (result.status === "error") {
        setSessionError(describeWirelessFailure(result.error, result.message));
      }
    },
    onSettled: () =>
      void queryClient.invalidateQueries({ queryKey: deviceListQueryKey }),
  });

  const connect = useCallback(async () => {
    if (selectedTransportId === null) {
      return;
    }
    setSessionError(null);
    try {
      await connectMutation.mutateAsync(selectedTransportId);
    } catch {
      // handled by onError
    }
  }, [selectedTransportId, connectMutation]);

  const disconnect = useCallback(async () => {
    setSessionError(null);
    try {
      await disconnectMutation.mutateAsync();
    } catch {
      // handled by onError
    }
  }, [disconnectMutation]);

  const pairWireless = useCallback(
    async (address: string, password: string) => {
      setSessionError(null);
      try {
        await pairWirelessMutation.mutateAsync({ address, password });
      } catch (cause) {
        setSessionError(errorMessage(cause));
      }
    },
    [pairWirelessMutation],
  );

  const connectWireless = useCallback(
    async (address: string) => {
      setSessionError(null);
      try {
        await connectWirelessMutation.mutateAsync(address);
      } catch (cause) {
        setSessionError(errorMessage(cause));
      }
    },
    [connectWirelessMutation],
  );

  const disconnectWireless = useCallback(
    async (address: string) => {
      setSessionError(null);
      try {
        await disconnectWirelessMutation.mutateAsync(address);
      } catch (cause) {
        setSessionError(errorMessage(cause));
      }
    },
    [disconnectWirelessMutation],
  );

  const refresh = useCallback(async () => {
    await devicesQuery.refetch();
  }, [devicesQuery]);

  const clearError = useCallback(() => setListError(null), []);
  const clearSessionError = useCallback(() => setSessionError(null), []);

  return {
    devices,
    session,
    sessionLoaded,
    selectedTransportId,
    loadingDevices,
    connecting: connectMutation.isPending,
    disconnecting: disconnectMutation.isPending,
    wirelessBusy:
      pairWirelessMutation.isPending ||
      connectWirelessMutation.isPending ||
      disconnectWirelessMutation.isPending,
    listError,
    sessionError,
    setSelectedTransportId,
    refresh,
    connect,
    disconnect,
    pairWireless,
    connectWireless,
    disconnectWireless,
    clearError,
    clearSessionError,
  };
}
