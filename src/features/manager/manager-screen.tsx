import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ExternalLinkIcon,
  MonitorIcon,
  PlugIcon,
  PlusIcon,
  RefreshCwIcon,
  SettingsIcon,
  SmartphoneIcon,
  UnplugIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdbDeviceDto, DeviceSessionDto } from "@/shared/device-contracts";
import type { AndroidDisplayDto, ScreenSessionDto } from "@/shared/screen-contracts";

interface DisplayState {
  screen: ScreenSessionDto | null;
  busy: boolean;
  error: string | null;
}

function deviceName(device: AdbDeviceDto): string {
  return device.model ?? device.device ?? (device.serial || device.transportId);
}

function sessionName(session: DeviceSessionDto, devices: AdbDeviceDto[]): string {
  const device = devices.find((item) => item.transportId === session.transportId);
  return device === undefined
    ? session.serial ?? session.transportId ?? session.sessionId
    : deviceName(device);
}

function displayName(display: AndroidDisplayDto): string {
  return display.name || `Display ${display.displayId}`;
}

export function ManagerScreen(): React.ReactElement {
  const [devices, setDevices] = useState<AdbDeviceDto[]>([]);
  const [sessions, setSessions] = useState<DeviceSessionDto[]>([]);
  const [displayStates, setDisplayStates] = useState<Record<string, DisplayState>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [virtualForm, setVirtualForm] = useState({ width: "800", height: "600", dpi: "320" });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [deviceResult, nextSessions] = await Promise.all([
        window.androidPlatform.listDevices(),
        window.androidPlatform.listDeviceSessions(),
      ]);
      setDevices(deviceResult.status === "ok" ? deviceResult.devices : []);
      setSessions(nextSessions);
      if (deviceResult.status === "error") {
        setError("ADB server is not reachable.");
      } else {
        setError(null);
      }

      const connected = nextSessions.filter((session) => session.state === "connected");
      const nextDisplays: Record<string, DisplayState> = {};
      await Promise.all(
        connected.map(async (session) => {
          const result = await window.androidPlatform.listScreenDisplays({
            sessionId: session.sessionId,
          });
          nextDisplays[session.sessionId] = result.status === "ok"
            ? { screen: result.screen, busy: false, error: null }
            : { screen: null, busy: false, error: result.error.message };
        }),
      );
      setDisplayStates(nextDisplays);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const connectedTransports = useMemo(
    () => new Set(
      sessions
        .filter((session) => session.state === "connected")
        .map((session) => session.transportId),
    ),
    [sessions],
  );

  const connect = async (transportId: string) => {
    setError(null);
    const result = await window.androidPlatform.connectDevice({ transportId });
    if (result.status === "error") {
      setError(`Could not connect: ${result.error}`);
    }
    await refresh();
  };

  const disconnect = async (sessionId: string) => {
    setError(null);
    const result = await window.androidPlatform.disconnectDevice({ sessionId });
    if (result.status === "error") {
      setError("Disconnect failed.");
    }
    await refresh();
  };

  const openScreen = async (sessionId: string, displayId: number) => {
    const result = await window.androidPlatform.openScreen({ sessionId, displayId });
    if (result.status === "error") {
      setError(result.message ?? "Could not open the screen window.");
    }
  };

  const createVirtual = async (sessionId: string) => {
    const width = Number(virtualForm.width);
    const height = Number(virtualForm.height);
    const dpi = Number(virtualForm.dpi);
    const result = await window.androidPlatform.createVirtualScreenForDevice({
      sessionId,
      width,
      height,
      dpi,
    });
    if (result.status === "error") {
      setError(result.error.message);
      return;
    }
    await refresh();
  };

  const destroyVirtual = async (sessionId: string, displayId: number) => {
    const result = await window.androidPlatform.destroyVirtualScreen({
      sessionId,
      displayId,
    });
    if (result.status === "error") {
      setError(result.error.message);
      return;
    }
    await refresh();
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <SmartphoneIcon className="size-4 text-muted-foreground" />
        <div>
          <h1 className="text-sm font-semibold">设备与屏幕</h1>
          <p className="text-[11px] text-muted-foreground">主工作台 · 每个屏幕可独立打开和运行</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void window.androidPlatform.openPairWindow()}
          >
            <PlugIcon />
            连接设备
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void window.androidPlatform.openSettingsWindow()}>
            <SettingsIcon />
            设置
          </Button>
          <Button size="sm" variant="outline" loading={loading} onClick={() => void refresh()}>
            <RefreshCwIcon />
            刷新
          </Button>
        </div>
      </header>

      {error !== null && (
        <div className="mx-4 mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <section className="mx-auto grid max-w-5xl gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">ADB 设备</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">同一台设备可同时打开多个显示屏窗口。</p>
            </div>
            <span className="text-[11px] text-muted-foreground">{devices.length} 个发现设备 · {sessions.length} 个会话</span>
          </div>

          {devices.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
              未发现可用设备。点击“连接设备”进行 USB 或无线配对。
            </div>
          ) : (
            devices.map((device) => {
              const connected = connectedTransports.has(device.transportId);
              const session = sessions.find((item) => item.transportId === device.transportId);
              return (
                <article key={device.transportId} className="rounded-lg border bg-card p-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-md bg-muted">
                      <SmartphoneIcon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{deviceName(device)}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{device.serial || "无序列号"} · transport {device.transportId}</div>
                    </div>
                    <span className="ml-auto text-[11px] text-muted-foreground">{device.state}</span>
                    {connected && session !== undefined ? (
                      <Button size="sm" variant="ghost" onClick={() => void disconnect(session.sessionId)}>
                        <UnplugIcon />
                        断开
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" disabled={device.state !== "device"} onClick={() => void connect(device.transportId)}>
                        连接
                      </Button>
                    )}
                  </div>

                  {session !== undefined && session.state === "connected" && (
                    <DeviceDisplays
                      session={session}
                      devices={devices}
                      state={displayStates[session.sessionId] ?? { screen: null, busy: false, error: null }}
                      virtualForm={virtualForm}
                      setVirtualForm={setVirtualForm}
                      onOpen={openScreen}
                      onCreate={createVirtual}
                      onDestroy={destroyVirtual}
                    />
                  )}
                </article>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}

function DeviceDisplays({
  session,
  devices,
  state,
  virtualForm,
  setVirtualForm,
  onOpen,
  onCreate,
  onDestroy,
}: {
  session: DeviceSessionDto;
  devices: AdbDeviceDto[];
  state: DisplayState;
  virtualForm: { width: string; height: string; dpi: string };
  setVirtualForm: (value: { width: string; height: string; dpi: string }) => void;
  onOpen: (sessionId: string, displayId: number) => Promise<void>;
  onCreate: (sessionId: string) => Promise<void>;
  onDestroy: (sessionId: string, displayId: number) => Promise<void>;
}): React.ReactElement {
  const displays = state.screen?.displays ?? [];
  return (
    <div className="mt-3 border-t pt-3">
      <div className="mb-2 flex items-center gap-2">
        <MonitorIcon className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">{sessionName(session, devices)} 的屏幕</span>
        <span className="text-[11px] text-muted-foreground">{session.sessionId}</span>
      </div>
      {state.error !== null && <p className="mb-2 text-[11px] text-destructive-foreground">{state.error}</p>}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {displays.map((display) => (
          <div key={display.displayId} className="flex items-center gap-2 rounded-md border bg-background p-2">
            {display.kind === "virtual" ? <MonitorIcon className="size-3.5" /> : <SmartphoneIcon className="size-3.5" />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{displayName(display)}</div>
              <div className="text-[10px] text-muted-foreground">display {display.displayId} · {display.kind}</div>
            </div>
            <Button size="icon-xs" variant="ghost" title="打开屏幕窗口" onClick={() => void onOpen(session.sessionId, display.displayId)}>
              <ExternalLinkIcon />
            </Button>
            {display.ownedBySession && (
              <Button size="icon-xs" variant="ghost" title="销毁虚拟屏" onClick={() => void onDestroy(session.sessionId, display.displayId)}>
                ×
              </Button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Input className="h-7 w-20 text-[11px]" value={virtualForm.width} onChange={(event) => setVirtualForm({ ...virtualForm, width: event.target.value })} aria-label="虚拟屏宽度" />
        <Input className="h-7 w-20 text-[11px]" value={virtualForm.height} onChange={(event) => setVirtualForm({ ...virtualForm, height: event.target.value })} aria-label="虚拟屏高度" />
        <Input className="h-7 w-20 text-[11px]" value={virtualForm.dpi} onChange={(event) => setVirtualForm({ ...virtualForm, dpi: event.target.value })} aria-label="虚拟屏 DPI" />
        <Button size="sm" variant="outline" onClick={() => void onCreate(session.sessionId)}>
          <PlusIcon />
          创建虚拟屏
        </Button>
      </div>
    </div>
  );
}
