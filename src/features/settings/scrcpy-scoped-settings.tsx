import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { m } from "@/paraglide/messages.js";
import type {
  AdbDeviceDto,
  DeviceSessionDto,
} from "@/shared/device-contracts";
import type {
  AndroidDisplayDto,
  ScrcpyOverridableScope,
  ScrcpySettingsScope,
  ScrcpySettingsScopeView,
} from "@/shared/screen-contracts";
import {
  useDeleteScrcpySettingsScope,
  useScrcpyConfiguredScopes,
  useScrcpyScopeView,
  useSetScrcpyGlobalSettings,
  useSetScrcpyScopeOverrides,
} from "@/hooks/query/use-scrcpy-settings";
import { ScrcpySettingsEditor } from "./scrcpy-settings-editor";

type ScopeKind = "global" | "device" | "screen";

interface DeviceOption {
  deviceKey: string;
  label: string;
  online: boolean;
}

interface ScreenOption {
  displayId: number;
  label: string;
  online: boolean;
}

const SCOPE_KINDS: readonly ScopeKind[] = ["global", "device", "screen"];

function deviceNameOf(device: AdbDeviceDto): string {
  return device.model ?? device.device ?? device.serial ?? device.transportId;
}

function scopeKindLabel(kind: ScopeKind): string {
  if (kind === "global") {
    return m.settings_scrcpy_apply_global();
  }
  if (kind === "device") {
    return m.settings_scrcpy_apply_device();
  }
  return m.settings_scrcpy_apply_screen();
}

function displayLabelOf(display: AndroidDisplayDto): string {
  return display.name || `Display ${display.displayId}`;
}

function paneKeyOf(scope: ScrcpySettingsScope): string {
  if (scope.scope === "global") {
    return "global";
  }
  if (scope.scope === "device") {
    return `device:${scope.deviceKey}`;
  }
  return `screen:${scope.deviceKey}:${scope.displayId}`;
}

export function ScrcpyScopedSettingsCard(): React.ReactElement {
  const [kind, setKind] = useState<ScopeKind>("global");
  const [deviceKey, setDeviceKey] = useState<string | null>(null);
  const [displayId, setDisplayId] = useState<number | null>(null);
  const [devices, setDevices] = useState<AdbDeviceDto[]>([]);
  const [sessions, setSessions] = useState<DeviceSessionDto[]>([]);
  const [displaysBySession, setDisplaysBySession] = useState<
    Record<string, AndroidDisplayDto[]>
  >({});

  const configuredScopesQuery = useScrcpyConfiguredScopes();
  const configuredScopes = useMemo(
    () => configuredScopesQuery.data ?? [],
    [configuredScopesQuery.data],
  );

  const refresh = useCallback(async () => {
    const [deviceResult, nextSessions] = await Promise.all([
      window.androidPlatform.listDevices(),
      window.androidPlatform.listDeviceSessions(),
    ]);
    setDevices(deviceResult.status === "ok" ? deviceResult.devices : []);
    setSessions(nextSessions);

    const connected = nextSessions.filter(
      (session) =>
        session.state === "connected" && session.serial !== null,
    );
    const nextDisplays: Record<string, AndroidDisplayDto[]> = {};
    await Promise.all(
      connected.map(async (session) => {
        try {
          const result = await window.androidPlatform.listScreenDisplays({
            sessionId: session.sessionId,
          });
          if (result.status === "ok") {
            nextDisplays[session.sessionId] = result.screen.displays;
          }
        } catch {
          // A device may disconnect while we are listing; ignore.
        }
      }),
    );
    setDisplaysBySession(nextDisplays);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 4_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  // Drop a stale display selection whenever the device or kind changes.
  useEffect(() => {
    setDisplayId(null);
  }, [kind, deviceKey]);

  const deviceOptions = useMemo<DeviceOption[]>(() => {
    const options = new Map<string, DeviceOption>();
    for (const session of sessions) {
      if (session.state !== "connected" || session.serial === null) {
        continue;
      }
      const device = devices.find(
        (item) => item.transportId === session.transportId,
      );
      const label =
        device === undefined ? session.serial : deviceNameOf(device);
      options.set(session.serial, { deviceKey: session.serial, label, online: true });
    }
    for (const scope of configuredScopes) {
      if (!options.has(scope.deviceKey)) {
        options.set(scope.deviceKey, {
          deviceKey: scope.deviceKey,
          label: scope.deviceKey,
          online: false,
        });
      }
    }
    // Keep the currently selected target in the list even while offline.
    if (deviceKey !== null && !options.has(deviceKey)) {
      options.set(deviceKey, { deviceKey, label: deviceKey, online: false });
    }
    return [...options.values()].sort((left, right) =>
      left.label.localeCompare(right.label),
    );
  }, [devices, sessions, configuredScopes, deviceKey]);

  const connectedSession = useMemo(
    () =>
      sessions.find(
        (session) =>
          session.state === "connected" && session.serial === deviceKey,
      ) ?? null,
    [sessions, deviceKey],
  );

  const screenOptions = useMemo<ScreenOption[]>(() => {
    if (deviceKey === null) {
      return [];
    }
    const options = new Map<number, ScreenOption>();
    if (connectedSession !== null) {
      for (const display of displaysBySession[connectedSession.sessionId] ??
        []) {
        if (display.kind === "virtual") {
          continue;
        }
        options.set(display.displayId, {
          displayId: display.displayId,
          label: displayLabelOf(display),
          online: true,
        });
      }
    }
    for (const scope of configuredScopes) {
      if (scope.scope === "screen" && scope.deviceKey === deviceKey) {
        if (!options.has(scope.displayId)) {
          options.set(scope.displayId, {
            displayId: scope.displayId,
            label: `Display ${scope.displayId}`,
            online: false,
          });
        }
      }
    }
    return [...options.values()].sort((left, right) =>
      left.displayId - right.displayId,
    );
  }, [deviceKey, connectedSession, displaysBySession, configuredScopes]);

  const hasDevices = deviceOptions.length > 0;
  const hasScreens = screenOptions.length > 0;

  const scopeValid =
    kind === "global" ||
    (kind === "device" && deviceKey !== null) ||
    (kind === "screen" &&
      deviceKey !== null &&
      displayId !== null &&
      hasScreens);

  const activeScope: ScrcpySettingsScope | null = scopeValid
    ? kind === "global"
      ? { scope: "global" }
      : kind === "device" && deviceKey !== null
        ? { scope: "device", deviceKey }
        : { scope: "screen", deviceKey: deviceKey as string, displayId: displayId as number }
    : null;

  return (
    <section className="rounded-lg border p-3">
      <h2 className="font-medium">{m.settings_scrcpy_title()}</h2>
      <p className="mt-1 text-muted-foreground">
        {m.settings_scrcpy_description()}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
          {SCOPE_KINDS.map((candidate) => (
            <Button
              key={candidate}
              size="sm"
              variant={kind === candidate ? "default" : "ghost"}
              onClick={() => setKind(candidate)}
            >
              {scopeKindLabel(candidate)}
            </Button>
          ))}
        </div>

        {kind !== "global" && (
          <Select
            value={deviceKey ?? ""}
            onValueChange={(value) => {
              if (value !== null) {
                setDeviceKey(String(value));
              }
            }}
          >
            <SelectTrigger
              size="sm"
              className="min-w-0 flex-1 sm:flex-none"
              aria-label={m.settings_scrcpy_select_device()}
            >
              <SelectValue
                placeholder={
                  hasDevices
                    ? m.settings_scrcpy_select_device()
                    : m.settings_scrcpy_no_devices()
                }
              />
            </SelectTrigger>
            <SelectContent className="max-h-56">
              {deviceOptions.map((option) => (
                <SelectItem key={option.deviceKey} value={option.deviceKey}>
                  <span className="flex items-center gap-1.5">
                    {option.label}
                    {!option.online && (
                      <span className="text-muted-foreground">
                        {m.settings_scrcpy_device_offline()}
                      </span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {kind === "screen" && (
          <Select
            value={displayId === null ? "" : String(displayId)}
            onValueChange={(value) => {
              if (value !== null && value !== "") {
                setDisplayId(Number(value));
              }
            }}
          >
            <SelectTrigger
              size="sm"
              className="min-w-0 flex-1 sm:flex-none"
              aria-label={m.settings_scrcpy_select_screen()}
            >
              <SelectValue
                placeholder={
                  hasScreens
                    ? m.settings_scrcpy_select_screen()
                    : m.settings_scrcpy_no_screens()
                }
              />
            </SelectTrigger>
            <SelectContent className="max-h-56">
              {screenOptions.map((option) => (
                <SelectItem key={option.displayId} value={String(option.displayId)}>
                  <span className="flex items-center gap-1.5">
                    {option.label}
                    {!option.online && (
                      <span className="text-muted-foreground">
                        {m.settings_scrcpy_device_offline()}
                      </span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {kind === "screen" && deviceKey !== null && !hasScreens && (
        <p className="mt-2 text-xs text-muted-foreground">
          {m.settings_scrcpy_no_screens()}
        </p>
      )}

      {activeScope === null ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {kind === "device" && !hasDevices
            ? m.settings_scrcpy_no_devices()
            : kind === "device"
              ? m.settings_scrcpy_select_device()
              : m.settings_scrcpy_select_screen()}
        </p>
      ) : kind === "global" ? (
        <GlobalSettingsPane
          key={paneKeyOf(activeScope)}
          scope={{ scope: "global" }}
        />
      ) : (
        <ScopedSettingsPane
          key={paneKeyOf(activeScope)}
          scope={activeScope as ScrcpyOverridableScope}
        />
      )}
    </section>
  );
}

function editorKeyOf(view: ScrcpySettingsScopeView): string {
  return view.scope.scope === "global"
    ? `global:${JSON.stringify(view.resolved)}`
    : `overrides:${JSON.stringify(view.overrides)}`;
}

function GlobalSettingsPane({
  scope,
}: {
  scope: { scope: "global" };
}): React.ReactElement {
  const viewQuery = useScrcpyScopeView(scope);
  const saveMutation = useSetScrcpyGlobalSettings();

  if (viewQuery.data === undefined) {
    return <p className="mt-3 text-xs text-muted-foreground">…</p>;
  }

  return (
    <div className="mt-3 border-t pt-1">
      <ScrcpySettingsEditor
        key={editorKeyOf(viewQuery.data)}
        mode="global"
        view={viewQuery.data}
        saving={saveMutation.isPending}
        error={errorTextOf(saveMutation.error)}
        onSave={(payload) => {
          void saveMutation.mutateAsync(payload as Parameters<typeof saveMutation.mutateAsync>[0]);
        }}
      />
    </div>
  );
}

function ScopedSettingsPane({
  scope,
}: {
  scope: ScrcpyOverridableScope;
}): React.ReactElement {
  const viewQuery = useScrcpyScopeView(scope);
  const saveMutation = useSetScrcpyScopeOverrides(scope);
  const deleteMutation = useDeleteScrcpySettingsScope();

  if (viewQuery.data === undefined) {
    return <p className="mt-3 text-xs text-muted-foreground">…</p>;
  }

  return (
    <div className="mt-3 border-t pt-1">
      <ScrcpySettingsEditor
        key={editorKeyOf(viewQuery.data)}
        mode="overrides"
        view={viewQuery.data}
        saving={saveMutation.isPending || deleteMutation.isPending}
        error={errorTextOf(saveMutation.error) ?? errorTextOf(deleteMutation.error)}
        onSave={(payload) => {
          void saveMutation.mutateAsync(
            payload as Parameters<typeof saveMutation.mutateAsync>[0],
          );
        }}
        onClearScope={() => {
          void deleteMutation.mutateAsync(scope);
        }}
      />
    </div>
  );
}

function errorTextOf(error: unknown): string | null {
  if (error === null || error === undefined) {
    return null;
  }
  return error instanceof Error ? error.message : String(error);
}
