import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_SCRCPY_SETTINGS,
  ScrcpySettingsSchema,
  type ScrcpySettings,
} from "@/shared/screen-contracts";
import {
  AlertTriangleIcon,
  PlugIcon,
  RefreshCwIcon,
  Settings2Icon,
  UnplugIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { useSafeLocalStorage } from "@/hooks/use-safe-local-storage";
import type { DeviceManager } from "./use-devices";

const SCRCPY_SETTINGS_STORAGE_KEY = "android-platform:scrcpy-settings";

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <div className="flex justify-end">{children}</div>
    </div>
  );
}

function ScrcpySettingsDialog() {
  const [open, setOpen] = useState(false);
  const [savedSettings, setSavedSettings] =
    useSafeLocalStorage(
      SCRCPY_SETTINGS_STORAGE_KEY,
      ScrcpySettingsSchema.nullable(),
      null,
    );
  const [settings, setSettings] = useState<ScrcpySettings>(
    DEFAULT_SCRCPY_SETTINGS,
  );
  const [draft, setDraft] = useState<ScrcpySettings>(DEFAULT_SCRCPY_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (savedSettings !== null) {
        const current = await window.androidPlatform.setScrcpySettings(
          savedSettings,
        );
        if (!cancelled) {
          setSettings(current);
          setDraft(current);
        }
        return;
      }
      const current = await window.androidPlatform.getScrcpySettings();
      if (!cancelled) {
        setSettings(current);
        setDraft(current);
      }
    };
    void load().catch((cause) => {
      if (!cancelled) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [savedSettings]);

  const validation = ScrcpySettingsSchema.safeParse(draft);

  const save = async () => {
    if (!validation.success) {
      setError("Check the numeric values and try again.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const next = await window.androidPlatform.setScrcpySettings(
        validation.data,
      );
      setSavedSettings(next);
      setSettings(next);
      setDraft(next);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setDraft(settings);
          setError(null);
        }
      }}
    >
      <DialogTrigger
        aria-label="Configure scrcpy"
        render={<Button size="icon-sm" variant="outline" />}
      >
        <Settings2Icon />
      </DialogTrigger>
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>scrcpy options</DialogTitle>
          <DialogDescription>
            Configure media transport and device behavior for the next screen
            stream. Auto size keeps the device's original resolution.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="divide-y py-0">
          <section className="py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Video
            </h3>
            <SettingRow
              title="Codec"
              description="H.265 is the default; device encoder support varies."
            >
              <Select
                value={draft.videoCodec}
                onValueChange={(value) => {
                  if (value !== null) {
                    setDraft((current) => ({
                      ...current,
                      videoCodec: value as ScrcpySettings["videoCodec"],
                    }));
                  }
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="w-full"
                  aria-label="Video codec"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="h264">H.264</SelectItem>
                  <SelectItem value="h265">H.265</SelectItem>
                  <SelectItem value="av1">AV1</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow
              title="Maximum size"
              description="Limit the longest edge, or leave it automatic."
            >
              <div className="flex w-full items-center gap-2">
                <Input
                  size="sm"
                  nativeInput
                  type="number"
                  min={256}
                  max={7680}
                  step={16}
                  disabled={draft.maxSize === null}
                  value={draft.maxSize ?? ""}
                  placeholder="Auto"
                  aria-label="Maximum video size"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      maxSize: Number(event.target.value),
                    }))
                  }
                />
                <label className="flex shrink-0 items-center gap-1.5 text-xs">
                  <Switch
                    aria-label="Use automatic video size"
                    checked={draft.maxSize === null}
                    onCheckedChange={(checked) =>
                      setDraft((current) => ({
                        ...current,
                        maxSize: checked ? null : 1920,
                      }))
                    }
                  />
                  Auto
                </label>
              </div>
            </SettingRow>
            <SettingRow title="Frame rate" description="Maximum frames per second.">
              <div className="flex w-full items-center gap-2">
                <Input
                  size="sm"
                  nativeInput
                  type="number"
                  min={1}
                  max={240}
                  value={draft.maxFps}
                  aria-label="Maximum frame rate"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      maxFps: Number(event.target.value),
                    }))
                  }
                />
                <span className="w-10 text-xs text-muted-foreground">FPS</span>
              </div>
            </SettingRow>
            <SettingRow title="Video bitrate" description="Target encoder bitrate.">
              <div className="flex w-full items-center gap-2">
                <Input
                  size="sm"
                  nativeInput
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={draft.videoBitRate / 1_000_000}
                  aria-label="Video bitrate in megabits per second"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      videoBitRate: Number(event.target.value) * 1_000_000,
                    }))
                  }
                />
                <span className="w-10 text-xs text-muted-foreground">Mbps</span>
              </div>
            </SettingRow>
          </section>

          <section className="py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Audio
            </h3>
            <SettingRow
              title="Transmit audio"
              description="Send Android audio through the scrcpy transport."
            >
              <Switch
                aria-label="Transmit audio"
                checked={draft.audio}
                onCheckedChange={(audio) =>
                  setDraft((current) => ({ ...current, audio }))
                }
              />
            </SettingRow>
            <SettingRow title="Source" description="Audio captured by the Android device.">
              <Select
                disabled={!draft.audio}
                value={draft.audioSource}
                onValueChange={(value) => {
                  if (value !== null) {
                    setDraft((current) => ({
                      ...current,
                      audioSource: value as ScrcpySettings["audioSource"],
                    }));
                  }
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="w-full"
                  aria-label="Audio source"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="output">Device output</SelectItem>
                  <SelectItem value="playback">Playback capture</SelectItem>
                  <SelectItem value="mic">Microphone</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow title="Audio codec" description="Opus is recommended for low latency.">
              <Select
                disabled={!draft.audio}
                value={draft.audioCodec}
                onValueChange={(value) => {
                  if (value !== null) {
                    setDraft((current) => ({
                      ...current,
                      audioCodec: value as ScrcpySettings["audioCodec"],
                    }));
                  }
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="w-full"
                  aria-label="Audio codec"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="opus">Opus</SelectItem>
                  <SelectItem value="aac">AAC</SelectItem>
                  <SelectItem value="flac">FLAC</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow title="Audio bitrate" description="Ignored by lossless FLAC encoders.">
              <div className="flex w-full items-center gap-2">
                <Input
                  size="sm"
                  nativeInput
                  type="number"
                  min={16}
                  max={1000}
                  step={16}
                  disabled={!draft.audio || draft.audioCodec === "flac"}
                  value={draft.audioBitRate / 1000}
                  aria-label="Audio bitrate in kilobits per second"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      audioBitRate: Number(event.target.value) * 1000,
                    }))
                  }
                />
                <span className="w-10 text-xs text-muted-foreground">Kbps</span>
              </div>
            </SettingRow>
          </section>

          <section className="py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Device behavior
            </h3>
            <SettingRow title="Screen off" description="Turn the physical screen off after scrcpy starts.">
              <Switch
                aria-label="Turn screen off after scrcpy starts"
                checked={draft.turnScreenOff}
                onCheckedChange={(turnScreenOff) =>
                  setDraft((current) => ({ ...current, turnScreenOff }))
                }
              />
            </SettingRow>
            <SettingRow title="Stay awake" description="Prevent the device from sleeping while plugged in.">
              <Switch
                aria-label="Keep device awake"
                checked={draft.stayAwake}
                onCheckedChange={(stayAwake) =>
                  setDraft((current) => ({ ...current, stayAwake }))
                }
              />
            </SettingRow>
            <SettingRow title="Show touches" description="Show Android touch feedback on the device.">
              <Switch
                aria-label="Show touches"
                checked={draft.showTouches}
                onCheckedChange={(showTouches) =>
                  setDraft((current) => ({ ...current, showTouches }))
                }
              />
            </SettingRow>
            <SettingRow title="Power off on close" description="Turn the device screen off when scrcpy exits.">
              <Switch
                aria-label="Power screen off when scrcpy closes"
                checked={draft.powerOffOnClose}
                onCheckedChange={(powerOffOnClose) =>
                  setDraft((current) => ({ ...current, powerOffOnClose }))
                }
              />
            </SettingRow>
          </section>
          {error !== null && (
            <p className="py-3 text-xs text-destructive-foreground">{error}</p>
          )}
        </DialogPanel>
        <DialogFooter>
          <DialogClose
            render={<Button variant="outline" />}
            onClick={() => setDraft(settings)}
          >
            Cancel
          </DialogClose>
          <Button
            loading={saving}
            disabled={!validation.success}
            onClick={() => void save()}
          >
            Save options
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function deviceLabel(serial: string, state: string, model?: string): string {
  const extras = [model, state].filter(Boolean).join(" · ");
  return extras.length > 0 ? `${serial} (${extras})` : serial;
}

export function DeviceConnectionPanel({ manager }: { manager: DeviceManager }) {
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

  const currentDevice = devices.find(
    (device) => device.transportId === selectedTransportId,
  );

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
          <span>Refresh</span>
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

      <div className="flex items-center gap-2">
        <Select
          value={canConnect ? selectedTransportId : ""}
          onValueChange={(value) => {
            if (value !== null) {
              setSelectedTransportId(String(value));
            }
          }}
          disabled={devices.length === 0}
        >
          <SelectTrigger size="sm" className="min-w-0 flex-1">
            <SelectValue
              placeholder={
                devices.length === 0 ? "No devices detected" : "Select a device"
              }
            >
              {currentDevice &&
                deviceLabel(
                  currentDevice.serial,
                  currentDevice.state,
                  currentDevice.model,
                )}
            </SelectValue>
          </SelectTrigger>

          <SelectContent className="max-h-56">
            {devices.map((device) => (
              <SelectItem key={device.transportId} value={device.transportId}>
                {deviceLabel(device.serial, device.state, device.model)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ScrcpySettingsDialog />
      </div>

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


    </div>
  );
}
