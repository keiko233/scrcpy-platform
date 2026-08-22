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
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "@tanstack/react-form";

import { useSafeLocalStorage } from "@/hooks/use-safe-local-storage";
import { useScrcpySettings, useSetScrcpySettings } from "@/hooks/query/use-scrcpy-settings";
import type { DeviceManager } from "@/features/workbench/device/use-devices";
import { m } from "@/paraglide/messages.js";

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
  const [savedSettings, setSavedSettings] = useSafeLocalStorage(
    SCRCPY_SETTINGS_STORAGE_KEY,
    ScrcpySettingsSchema.nullable().default(null),
  );
  const [error, setError] = useState<string | null>(null);

  const settingsQuery = useScrcpySettings();
  const applySettings = useSetScrcpySettings();
  const settings = settingsQuery.data ?? DEFAULT_SCRCPY_SETTINGS;

  const form = useForm({
    defaultValues: settings as ScrcpySettings,
    validators: {
      onChange: ScrcpySettingsSchema,
    },
    onSubmit: async ({ value }) => {
      setError(null);
      try {
        const next = await applySettings.mutateAsync(value);
        setSavedSettings(next);
        form.reset(next);
        setOpen(false);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
  });

  useEffect(() => {
    if (savedSettings !== null) {
      void applySettings.mutateAsync(savedSettings).catch((cause) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      });
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (settingsQuery.error !== null) {
      setError(
        settingsQuery.error instanceof Error
          ? settingsQuery.error.message
          : String(settingsQuery.error),
      );
    }
  }, [settingsQuery.error]);

  // Keep form in sync with remote settings when not open
  useEffect(() => {
    if (!open) {
      form.reset(settings);
    }
  }, [form, open, settings]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          form.reset(settings);
          setError(null);
        }
      }}
    >
      <DialogTrigger
        aria-label={m.pair_scrcpy_configure_aria()}
        render={<Button size="icon-sm" variant="outline" />}
      >
        <Settings2Icon />
      </DialogTrigger>
      <DialogPopup className="max-w-2xl">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
          className="contents"
        >
          <DialogHeader>
            <DialogTitle>{m.pair_scrcpy_title()}</DialogTitle>
            <DialogDescription>{m.pair_scrcpy_description()}</DialogDescription>
          </DialogHeader>
          <DialogPanel className="divide-y py-0">
            <section className="py-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {m.pair_scrcpy_video()}
              </h3>
              <SettingRow
                title={m.pair_scrcpy_codec()}
                description={m.pair_scrcpy_codec_description()}
              >
                <form.Field name="videoCodec">
                  {(field) => (
                    <Select
                      value={field.state.value}
                      onValueChange={(value) => {
                        if (value !== null) {
                          field.handleChange(value as ScrcpySettings["videoCodec"]);
                        }
                      }}
                    >
                      <SelectTrigger
                        size="sm"
                        className="w-full"
                        aria-label={m.pair_scrcpy_codec()}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="h264">H.264</SelectItem>
                        <SelectItem value="h265">H.265</SelectItem>
                        <SelectItem value="av1">AV1</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </form.Field>
              </SettingRow>
              <SettingRow
                title={m.pair_scrcpy_max_size()}
                description={m.pair_scrcpy_max_size_description()}
              >
                <form.Field name="maxSize">
                  {(field) => (
                    <div className="flex w-full items-center gap-2">
                      <Input
                        size="sm"
                        nativeInput
                        type="number"
                        min={256}
                        max={7680}
                        step={16}
                        disabled={field.state.value === null}
                        value={field.state.value ?? ""}
                        placeholder={m.pair_scrcpy_max_size_placeholder()}
                        aria-label={m.pair_scrcpy_max_size_aria()}
                        onChange={(event) => {
                          const raw = event.target.value;
                          if (raw === "") {
                            field.handleChange(null as unknown as number);
                            return;
                          }
                          const parsed = Number(raw);
                          field.handleChange(
                            Number.isNaN(parsed) ? (null as unknown as number) : parsed,
                          );
                        }}
                        onBlur={field.handleBlur}
                      />
                      <label className="flex shrink-0 items-center gap-1.5 text-xs">
                        <Switch
                          aria-label={m.pair_scrcpy_auto_size_aria()}
                          checked={field.state.value === null}
                          onCheckedChange={(checked) => field.handleChange(checked ? null : 1920)}
                        />
                        {m.pair_scrcpy_auto()}
                      </label>
                    </div>
                  )}
                </form.Field>
              </SettingRow>
              <SettingRow
                title={m.pair_scrcpy_frame_rate()}
                description={m.pair_scrcpy_frame_rate_description()}
              >
                <form.Field name="maxFps">
                  {(field) => (
                    <div className="flex w-full items-center gap-2">
                      <Input
                        size="sm"
                        nativeInput
                        type="number"
                        min={1}
                        max={240}
                        value={String(field.state.value ?? "")}
                        aria-label={m.pair_scrcpy_frame_rate_aria()}
                        onChange={(event) => {
                          const parsed = Number(event.target.value);
                          field.handleChange(Number.isNaN(parsed) ? 0 : parsed);
                        }}
                        onBlur={field.handleBlur}
                      />
                      <span className="w-10 text-xs text-muted-foreground">
                        {m.pair_scrcpy_fps()}
                      </span>
                    </div>
                  )}
                </form.Field>
              </SettingRow>
              <SettingRow
                title={m.pair_scrcpy_video_bitrate()}
                description={m.pair_scrcpy_video_bitrate_description()}
              >
                <form.Field name="videoBitRate">
                  {(field) => (
                    <div className="flex w-full items-center gap-2">
                      <Input
                        size="sm"
                        nativeInput
                        type="number"
                        min={1}
                        max={100}
                        step={1}
                        value={String((field.state.value as number) / 1_000_000)}
                        aria-label={m.pair_scrcpy_video_bitrate_aria()}
                        onChange={(event) => {
                          const parsed = Number(event.target.value);
                          field.handleChange(
                            Number.isNaN(parsed) ? 0 : Math.round(parsed * 1_000_000),
                          );
                        }}
                        onBlur={field.handleBlur}
                      />
                      <span className="w-10 text-xs text-muted-foreground">{m.pair_scrcpy_mbps()}</span>
                    </div>
                  )}
                </form.Field>
              </SettingRow>
            </section>

            <section className="py-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {m.pair_scrcpy_audio()}
              </h3>
              <SettingRow
                title={m.pair_scrcpy_transmit_audio()}
                description={m.pair_scrcpy_transmit_audio_description()}
              >
                <form.Field name="audio">
                  {(field) => (
                    <Switch
                      aria-label={m.pair_scrcpy_transmit_audio_aria()}
                      checked={field.state.value as boolean}
                      onCheckedChange={(checked) => field.handleChange(checked as unknown as boolean)}
                    />
                  )}
                </form.Field>
              </SettingRow>
              <SettingRow
                title={m.pair_scrcpy_audio_source()}
                description={m.pair_scrcpy_audio_source_description()}
              >
                <form.Subscribe selector={(state) => state.values.audio}>
                  {(audio) => (
                    <form.Field name="audioSource">
                      {(field) => (
                        <Select
                          disabled={!audio}
                          value={field.state.value as string}
                          onValueChange={(value) => {
                            if (value !== null) {
                              field.handleChange(value as ScrcpySettings["audioSource"]);
                            }
                          }}
                        >
                          <SelectTrigger
                            size="sm"
                            className="w-full"
                            aria-label={m.pair_scrcpy_audio_source_aria()}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="output">{m.pair_scrcpy_audio_source_output()}</SelectItem>
                            <SelectItem value="playback">{m.pair_scrcpy_audio_source_playback()}</SelectItem>
                            <SelectItem value="mic">{m.pair_scrcpy_audio_source_mic()}</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </form.Field>
                  )}
                </form.Subscribe>
              </SettingRow>
              <SettingRow
                title={m.pair_scrcpy_audio_codec()}
                description={m.pair_scrcpy_audio_codec_description()}
              >
                <form.Subscribe selector={(state) => state.values.audio}>
                  {(audio) => (
                    <form.Field name="audioCodec">
                      {(field) => (
                        <Select
                          disabled={!audio}
                          value={field.state.value as string}
                          onValueChange={(value) => {
                            if (value !== null) {
                              field.handleChange(value as ScrcpySettings["audioCodec"]);
                            }
                          }}
                        >
                          <SelectTrigger
                            size="sm"
                            className="w-full"
                            aria-label={m.pair_scrcpy_audio_codec_aria()}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="opus">Opus</SelectItem>
                            <SelectItem value="aac">AAC</SelectItem>
                            <SelectItem value="flac">FLAC</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </form.Field>
                  )}
                </form.Subscribe>
              </SettingRow>
              <SettingRow
                title={m.pair_scrcpy_audio_bitrate()}
                description={m.pair_scrcpy_audio_bitrate_description()}
              >
                <form.Subscribe selector={(state) => ({ audio: state.values.audio, codec: state.values.audioCodec })}>
                  {({ audio, codec }) => (
                    <form.Field name="audioBitRate">
                      {(field) => (
                        <div className="flex w-full items-center gap-2">
                          <Input
                            size="sm"
                            nativeInput
                            type="number"
                            min={16}
                            max={1000}
                            step={16}
                            disabled={!audio || codec === "flac"}
                            value={String((field.state.value as number) / 1000)}
                            aria-label={m.pair_scrcpy_audio_bitrate_aria()}
                            onChange={(event) => {
                              const parsed = Number(event.target.value);
                              field.handleChange(
                                Number.isNaN(parsed) ? 0 : Math.round(parsed * 1000),
                              );
                            }}
                            onBlur={field.handleBlur}
                          />
                          <span className="w-10 text-xs text-muted-foreground">{m.pair_scrcpy_kbps()}</span>
                        </div>
                      )}
                    </form.Field>
                  )}
                </form.Subscribe>
              </SettingRow>
            </section>

            <section className="py-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {m.pair_scrcpy_device_behavior()}
              </h3>
              <SettingRow
                title={m.pair_scrcpy_screen_off()}
                description={m.pair_scrcpy_screen_off_description()}
              >
                <form.Field name="turnScreenOff">
                  {(field) => (
                    <Switch
                      aria-label={m.pair_scrcpy_screen_off_aria()}
                      checked={field.state.value as boolean}
                      onCheckedChange={(checked) => field.handleChange(checked as unknown as boolean)}
                    />
                  )}
                </form.Field>
              </SettingRow>
              <SettingRow
                title={m.pair_scrcpy_stay_awake()}
                description={m.pair_scrcpy_stay_awake_description()}
              >
                <form.Field name="stayAwake">
                  {(field) => (
                    <Switch
                      aria-label={m.pair_scrcpy_stay_awake_aria()}
                      checked={field.state.value as boolean}
                      onCheckedChange={(checked) => field.handleChange(checked as unknown as boolean)}
                    />
                  )}
                </form.Field>
              </SettingRow>
              <SettingRow
                title={m.pair_scrcpy_show_touches()}
                description={m.pair_scrcpy_show_touches_description()}
              >
                <form.Field name="showTouches">
                  {(field) => (
                    <Switch
                      aria-label={m.pair_scrcpy_show_touches_aria()}
                      checked={field.state.value as boolean}
                      onCheckedChange={(checked) => field.handleChange(checked as unknown as boolean)}
                    />
                  )}
                </form.Field>
              </SettingRow>
              <SettingRow
                title={m.pair_scrcpy_power_off_on_close()}
                description={m.pair_scrcpy_power_off_on_close_description()}
              >
                <form.Field name="powerOffOnClose">
                  {(field) => (
                    <Switch
                      aria-label={m.pair_scrcpy_power_off_on_close_aria()}
                      checked={field.state.value as boolean}
                      onCheckedChange={(checked) => field.handleChange(checked as unknown as boolean)}
                    />
                  )}
                </form.Field>
              </SettingRow>
            </section>
            {error !== null && <p className="py-3 text-xs text-destructive-foreground">{error}</p>}
            <form.Subscribe selector={(state) => state.errors}>
              {(errors) =>
                errors.length > 0 ? (
                  <p className="py-2 text-xs text-destructive-foreground">
                    {m.pair_scrcpy_error_check_values()}
                  </p>
                ) : null
              }
            </form.Subscribe>
          </DialogPanel>
          <DialogFooter>
            <DialogClose
              render={<Button variant="outline" type="button" />}
              onClick={() => form.reset(settings)}
            >
              {m.pair_scrcpy_cancel()}
            </DialogClose>
            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
              {([canSubmit, isSubmitting]) => (
                <Button type="submit" loading={isSubmitting as boolean} disabled={!canSubmit}>
                  {m.pair_scrcpy_save()}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
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
    listError,
    sessionError,
    setSelectedTransportId,
    refresh,
    connect,
    clearError,
    clearSessionError,
  } = manager;

  const busy = connecting;
  const state = session?.state ?? "disconnected";
  const canConnect =
    selectedTransportId !== null && devices.some((device) => device.transportId === selectedTransportId);

  const currentDevice = devices.find((device) => device.transportId === selectedTransportId);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="text-xs font-medium">{m.pair_device_connection()}</span>
          <span className="truncate text-[10px] text-muted-foreground">
            {m.pair_device_connection_subtitle()}
          </span>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => void refresh()}
          loading={loadingDevices}
          aria-label={m.pair_refresh_aria()}
        >
          <RefreshCwIcon />
          <span>{m.pair_refresh()}</span>
        </Button>
      </div>

      {listError !== null && (
        <Alert variant="warning" className="gap-1.5 px-2.5 py-2 text-xs">
          <AlertTriangleIcon />
          <AlertTitle className="text-xs">{m.pair_device_list_unavailable()}</AlertTitle>
          <AlertDescription className="text-[11px]">{listError}</AlertDescription>
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
              placeholder={devices.length === 0 ? m.pair_no_devices() : m.pair_select_device()}
            >
              {currentDevice && deviceLabel(currentDevice.serial, currentDevice.state, currentDevice.model)}
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
          {m.pair_connect()}
        </Button>
        {(listError !== null || sessionError !== null) && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={m.pair_clear_status()}
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
