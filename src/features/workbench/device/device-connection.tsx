import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertTriangleIcon,
  PlugIcon,
  RefreshCwIcon,
  UnplugIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

import type { DeviceManager } from "./use-devices";

function deviceLabel(serial: string, state: string, model?: string): string {
  const extras = [model, state].filter(Boolean).join(" · ");
  return extras.length > 0 ? `${serial} (${extras})` : serial;
}

const STATE_VARIANT: Record<string, "outline" | "success" | "warning" | "error"> =
  {
    disconnected: "outline",
    connecting: "warning",
    connected: "success",
    disconnecting: "warning",
    error: "error",
  };

export function DeviceConnectionPanel({
  manager,
}: {
  manager: DeviceManager;
}) {
  const {
    devices,
    session,
    selectedTransportId,
    loadingDevices,
    connecting,
    disconnecting,
    listError,
    sessionError,
    setSelectedTransportId,
    refresh,
    connect,
    disconnect,
    clearError,
    clearSessionError,
  } = manager;

  const busy = connecting || disconnecting;
  const state = session?.state ?? "disconnected";
  const canConnect =
    selectedTransportId !== null &&
    devices.some((device) => device.transportId === selectedTransportId);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="text-xs font-medium">Device connection</span>
          <span className="truncate text-[10px] text-muted-foreground">
            ADB transport selection
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void refresh()}
          loading={loadingDevices}
          aria-label="Refresh device list"
        >
          <RefreshCwIcon />
          Refresh
        </Button>
      </div>

      {listError !== null && (
        <Alert variant="warning" className="gap-1.5 px-2.5 py-2 text-xs">
          <AlertTriangleIcon />
          <AlertTitle className="text-xs">Device list unavailable</AlertTitle>
          <AlertDescription className="text-[11px]">
            {listError}
          </AlertDescription>
        </Alert>
      )}

      <Select
        value={canConnect ? selectedTransportId : ""}
        onValueChange={(value) => {
          if (value !== null) {
            setSelectedTransportId(String(value));
          }
        }}
        disabled={devices.length === 0}
      >
        <SelectTrigger size="sm">
          <SelectValue
            placeholder={
              devices.length === 0 ? "No devices detected" : "Select a device"
            }
          />
        </SelectTrigger>
        <SelectContent className="max-h-56">
          {devices.map((device) => (
            <SelectItem key={device.transportId} value={device.transportId}>
              {deviceLabel(device.serial, device.state, device.model)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="default"
          className="flex-1"
          disabled={!canConnect || busy || state === "connected"}
          loading={connecting}
          onClick={() => void connect()}
        >
          <PlugIcon />
          Connect
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          disabled={busy || state === "disconnected" || state === "error"}
          loading={disconnecting}
          onClick={() => void disconnect()}
        >
          <UnplugIcon />
          Disconnect
        </Button>
        {(listError !== null || sessionError !== null) && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Clear status labels"
            onClick={() => {
              clearError();
              clearSessionError();
            }}
          >
            <XIcon />
          </Button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-lg border p-2">
        <div className="flex items-center gap-2">
          <Badge size="sm" variant={STATE_VARIANT[state]}>
            <span
              className={cn(
                "size-1.5 rounded-full",
                state === "connected" ? "bg-success" : "bg-current",
              )}
            />
            {state}
          </Badge>
          {busy && <Spinner className="size-3" />}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
          <dt className="text-muted-foreground">Session ID</dt>
          <dd className="truncate font-mono" title={session?.sessionId}>
            {session?.sessionId ?? "—"}
          </dd>
          <dt className="text-muted-foreground">Transport</dt>
          <dd className="truncate font-mono">
            {session?.transportId ?? "—"}
          </dd>
          <dt className="text-muted-foreground">Serial</dt>
          <dd className="truncate font-mono">{session?.serial ?? "—"}</dd>
        </dl>

        {sessionError !== null && (
          <Alert variant="error" className="gap-1.5 px-2.5 py-2 text-xs">
            <AlertTriangleIcon />
            <AlertTitle className="text-xs">Connection issue</AlertTitle>
            <AlertDescription className="text-[11px]">
              {sessionError}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
