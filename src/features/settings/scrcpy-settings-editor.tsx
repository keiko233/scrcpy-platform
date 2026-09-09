import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { m } from "@/paraglide/messages.js";
import {
  ScrcpyOverridesSchema,
  ScrcpySettingsSchema,
  type ScrcpyOverridableField,
  type ScrcpyOverrides,
  type ScrcpySettings,
  type ScrcpySettingsScopeView,
} from "@/shared/screen-contracts";

export type ScrcpyEditorMode = "global" | "overrides";

interface SettingRowProps {
  title: string;
  description?: string;
  overridable?: boolean;
  overrideEnabled?: boolean;
  onToggleOverride?: (enabled: boolean) => void;
  inheritedNote?: boolean;
  children: React.ReactNode;
}

function SettingRow({
  title,
  description,
  overridable = false,
  overrideEnabled = false,
  onToggleOverride,
  inheritedNote = false,
  children,
}: SettingRowProps) {
  return (
    <div className="grid gap-2 py-2.5">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">{title}</div>
          {description !== undefined && (
            <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
          )}
        </div>
        {overridable && (
          <div className="flex shrink-0 items-center gap-1.5 text-xs">
            <Switch
              aria-label={m.settings_scrcpy_override_aria()}
              checked={overrideEnabled}
              onCheckedChange={(checked) => onToggleOverride?.(checked)}
            />
          </div>
        )}
      </div>
      <div className={overridable ? "pl-0" : undefined}>
        {children}
        {overridable && !overrideEnabled && inheritedNote && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            {m.settings_scrcpy_follows_parent()}
          </p>
        )}
      </div>
    </div>
  );
}

export interface ScrcpySettingsEditorProps {
  mode: ScrcpyEditorMode;
  view: ScrcpySettingsScopeView;
  saving: boolean;
  error: string | null;
  onSave: (payload: ScrcpySettings | ScrcpyOverrides) => void;
  onClearScope?: () => void;
}

/**
 * Full scrcpy options editor. In "global" mode every field is editable and a
 * full settings object is saved. In "overrides" mode only the overridable
 * streaming fields appear, each with a switch that controls whether the field
 * is stored at this scope or inherited from the parent scope.
 */
export function ScrcpySettingsEditor({
  mode,
  view,
  saving,
  error,
  onSave,
  onClearScope,
}: ScrcpySettingsEditorProps): React.ReactElement {
  const [draft, setDraft] = useState<ScrcpySettings | ScrcpyOverrides>(() =>
    mode === "global" ? { ...view.resolved } : { ...view.overrides },
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const scoped = mode === "overrides";

  /** Whether the field is locked to the inherited value at this scope. */
  const locked = (field: ScrcpyOverridableField): boolean =>
    scoped && !Object.prototype.hasOwnProperty.call(draft, field);

  const valueOf = <K extends keyof ScrcpySettings>(
    field: K,
  ): ScrcpySettings[K] => {
    if (scoped) {
      const overrides = draft as ScrcpyOverrides;
      if (Object.prototype.hasOwnProperty.call(overrides, field)) {
        return (overrides as Record<string, ScrcpySettings[K]>)[field];
      }
      return view.resolved[field];
    }
    return (draft as ScrcpySettings)[field];
  };

  const patch = <K extends keyof ScrcpySettings>(
    field: K,
    value: ScrcpySettings[K] | null | undefined,
  ): void => {
    const next = { ...draft } as Record<string, unknown>;
    if (value === undefined) {
      delete next[field];
    } else {
      next[field] = value;
    }
    setDraft(next as ScrcpySettings | ScrcpyOverrides);
    setValidationError(null);
  };

  const toggleOverride = (field: ScrcpyOverridableField, enabled: boolean): void => {
    if (enabled) {
      const next = { ...draft } as Record<string, unknown>;
      next[field] = view.resolved[field];
      setDraft(next as ScrcpySettings | ScrcpyOverrides);
    } else {
      patch(field, undefined);
    }
    setValidationError(null);
  };

  const effectiveAudio = valueOf("audio");
  const effectiveAudioCodec = valueOf("audioCodec");

  const save = (): void => {
    const schema = scoped ? ScrcpyOverridesSchema : ScrcpySettingsSchema;
    const parsed = schema.safeParse(draft);
    if (!parsed.success) {
      setValidationError(m.settings_scrcpy_error_check());
      return;
    }
    setValidationError(null);
    onSave(parsed.data);
  };

  const discard = (): void => {
    setDraft(scoped ? { ...view.overrides } : { ...view.resolved });
    setValidationError(null);
  };

  const videoCodec = valueOf("videoCodec");
  const audioSource = valueOf("audioSource");
  const audioCodec = valueOf("audioCodec");
  const maxSize = valueOf("maxSize");
  const maxFps = valueOf("maxFps");
  const videoBitRate = valueOf("videoBitRate");
  const audioBitRate = valueOf("audioBitRate");

  return (
    <div className="divide-y">
      <section className="py-3">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {m.pair_scrcpy_video()}
        </h3>
        <SettingRow
          title={m.pair_scrcpy_codec()}
          description={m.pair_scrcpy_codec_description()}
          overridable={scoped}
          overrideEnabled={!locked("videoCodec")}
          onToggleOverride={(enabled) => toggleOverride("videoCodec", enabled)}
          inheritedNote={scoped}
        >
          <Select
            value={videoCodec}
            disabled={locked("videoCodec")}
            onValueChange={(value) => {
              if (value !== null) {
                patch("videoCodec", value as ScrcpySettings["videoCodec"]);
              }
            }}
          >
            <SelectTrigger size="sm" className="w-full" aria-label={m.pair_scrcpy_codec()}>
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
          title={m.pair_scrcpy_max_size()}
          description={m.pair_scrcpy_max_size_description()}
          overridable={scoped}
          overrideEnabled={!locked("maxSize")}
          onToggleOverride={(enabled) => toggleOverride("maxSize", enabled)}
          inheritedNote={scoped}
        >
          <div className="flex w-full items-center gap-2">
            <Input
              size="sm"
              nativeInput
              type="number"
              min={256}
              max={7680}
              step={16}
              disabled={locked("maxSize") || maxSize === null}
              value={maxSize ?? ""}
              placeholder={m.pair_scrcpy_max_size_placeholder()}
              aria-label={m.pair_scrcpy_max_size_aria()}
              onChange={(event) => {
                const raw = event.target.value;
                const parsed = Number(raw);
                patch(
                  "maxSize",
                  raw === "" || Number.isNaN(parsed)
                    ? null
                    : Math.min(7680, Math.max(256, parsed)),
                );
              }}
            />
            <label className="flex shrink-0 items-center gap-1.5 text-xs">
              <Switch
                aria-label={m.pair_scrcpy_auto_size_aria()}
                checked={maxSize === null}
                disabled={locked("maxSize")}
                onCheckedChange={(checked) =>
                  patch("maxSize", checked ? null : 1920)
                }
              />
              {m.pair_scrcpy_auto()}
            </label>
          </div>
        </SettingRow>
        <SettingRow
          title={m.pair_scrcpy_frame_rate()}
          description={m.pair_scrcpy_frame_rate_description()}
          overridable={scoped}
          overrideEnabled={!locked("maxFps")}
          onToggleOverride={(enabled) => toggleOverride("maxFps", enabled)}
          inheritedNote={scoped}
        >
          <div className="flex w-full items-center gap-2">
            <Input
              size="sm"
              nativeInput
              type="number"
              min={1}
              max={240}
              disabled={locked("maxFps")}
              value={String(maxFps)}
              aria-label={m.pair_scrcpy_frame_rate_aria()}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                patch("maxFps", Number.isNaN(parsed) ? 0 : Math.min(240, Math.max(1, parsed)));
              }}
            />
            <span className="w-10 text-xs text-muted-foreground">{m.pair_scrcpy_fps()}</span>
          </div>
        </SettingRow>
        <SettingRow
          title={m.pair_scrcpy_video_bitrate()}
          description={m.pair_scrcpy_video_bitrate_description()}
          overridable={scoped}
          overrideEnabled={!locked("videoBitRate")}
          onToggleOverride={(enabled) => toggleOverride("videoBitRate", enabled)}
          inheritedNote={scoped}
        >
          <div className="flex w-full items-center gap-2">
            <Input
              size="sm"
              nativeInput
              type="number"
              min={1}
              max={100}
              step={1}
              disabled={locked("videoBitRate")}
              value={String(Math.round(videoBitRate / 1_000_000))}
              aria-label={m.pair_scrcpy_video_bitrate_aria()}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                patch(
                  "videoBitRate",
                  Number.isNaN(parsed) ? 0 : Math.round(parsed * 1_000_000),
                );
              }}
            />
            <span className="w-10 text-xs text-muted-foreground">{m.pair_scrcpy_mbps()}</span>
          </div>
        </SettingRow>
      </section>

      <section className="py-3">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {m.pair_scrcpy_audio()}
        </h3>
        <SettingRow
          title={m.pair_scrcpy_transmit_audio()}
          description={m.pair_scrcpy_transmit_audio_description()}
          overridable={scoped}
          overrideEnabled={!locked("audio")}
          onToggleOverride={(enabled) => toggleOverride("audio", enabled)}
          inheritedNote={scoped}
        >
          <Switch
            aria-label={m.pair_scrcpy_transmit_audio_aria()}
            checked={effectiveAudio}
            disabled={locked("audio")}
            onCheckedChange={(checked) => patch("audio", checked)}
          />
        </SettingRow>
        <SettingRow
          title={m.pair_scrcpy_audio_source()}
          description={m.pair_scrcpy_audio_source_description()}
          overridable={scoped}
          overrideEnabled={!locked("audioSource")}
          onToggleOverride={(enabled) => toggleOverride("audioSource", enabled)}
          inheritedNote={scoped}
        >
          <Select
            disabled={locked("audioSource") || !effectiveAudio}
            value={audioSource}
            onValueChange={(value) => {
              if (value !== null) {
                patch("audioSource", value as ScrcpySettings["audioSource"]);
              }
            }}
          >
            <SelectTrigger size="sm" className="w-full" aria-label={m.pair_scrcpy_audio_source_aria()}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="output">{m.pair_scrcpy_audio_source_output()}</SelectItem>
              <SelectItem value="playback">{m.pair_scrcpy_audio_source_playback()}</SelectItem>
              <SelectItem value="mic">{m.pair_scrcpy_audio_source_mic()}</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow
          title={m.pair_scrcpy_audio_codec()}
          description={m.pair_scrcpy_audio_codec_description()}
          overridable={scoped}
          overrideEnabled={!locked("audioCodec")}
          onToggleOverride={(enabled) => toggleOverride("audioCodec", enabled)}
          inheritedNote={scoped}
        >
          <Select
            disabled={locked("audioCodec") || !effectiveAudio}
            value={audioCodec}
            onValueChange={(value) => {
              if (value !== null) {
                patch("audioCodec", value as ScrcpySettings["audioCodec"]);
              }
            }}
          >
            <SelectTrigger size="sm" className="w-full" aria-label={m.pair_scrcpy_audio_codec_aria()}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="opus">Opus</SelectItem>
              <SelectItem value="aac">AAC</SelectItem>
              <SelectItem value="flac">FLAC</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow
          title={m.pair_scrcpy_audio_bitrate()}
          description={m.pair_scrcpy_audio_bitrate_description()}
          overridable={scoped}
          overrideEnabled={!locked("audioBitRate")}
          onToggleOverride={(enabled) => toggleOverride("audioBitRate", enabled)}
          inheritedNote={scoped}
        >
          <div className="flex w-full items-center gap-2">
            <Input
              size="sm"
              nativeInput
              type="number"
              min={16}
              max={1000}
              step={16}
              disabled={
                locked("audioBitRate") ||
                !effectiveAudio ||
                effectiveAudioCodec === "flac"
              }
              value={String(Math.round(audioBitRate / 1000))}
              aria-label={m.pair_scrcpy_audio_bitrate_aria()}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                patch(
                  "audioBitRate",
                  Number.isNaN(parsed) ? 0 : Math.round(parsed * 1000),
                );
              }}
            />
            <span className="w-10 text-xs text-muted-foreground">{m.pair_scrcpy_kbps()}</span>
          </div>
        </SettingRow>
      </section>

      {!scoped && (
        <section className="py-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {m.pair_scrcpy_device_behavior()}
          </h3>
          <BehaviorSwitch
            title={m.pair_scrcpy_screen_off()}
            description={m.pair_scrcpy_screen_off_description()}
            checked={valueOf("turnScreenOff")}
            ariaLabel={m.pair_scrcpy_screen_off_aria()}
            onChange={(checked) => patch("turnScreenOff", checked)}
          />
          <BehaviorSwitch
            title={m.pair_scrcpy_stay_awake()}
            description={m.pair_scrcpy_stay_awake_description()}
            checked={valueOf("stayAwake")}
            ariaLabel={m.pair_scrcpy_stay_awake_aria()}
            onChange={(checked) => patch("stayAwake", checked)}
          />
          <BehaviorSwitch
            title={m.pair_scrcpy_show_touches()}
            description={m.pair_scrcpy_show_touches_description()}
            checked={valueOf("showTouches")}
            ariaLabel={m.pair_scrcpy_show_touches_aria()}
            onChange={(checked) => patch("showTouches", checked)}
          />
          <BehaviorSwitch
            title={m.pair_scrcpy_power_off_on_close()}
            description={m.pair_scrcpy_power_off_on_close_description()}
            checked={valueOf("powerOffOnClose")}
            ariaLabel={m.pair_scrcpy_power_off_on_close_aria()}
            onChange={(checked) => patch("powerOffOnClose", checked)}
          />
        </section>
      )}

      {(validationError !== null || error !== null) && (
        <p className="py-2 text-xs text-destructive-foreground">
          {validationError ?? error}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 py-3">
        <div className="flex items-center gap-1.5">
          {scoped && onClearScope !== undefined && (
            <Button
              size="sm"
              variant="ghost"
              type="button"
              disabled={saving || Object.keys(view.overrides).length === 0}
              onClick={onClearScope}
            >
              {m.settings_scrcpy_clear_scope()}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" type="button" onClick={discard}>
            {m.pair_scrcpy_cancel()}
          </Button>
          <Button size="sm" type="button" loading={saving} onClick={save}>
            {m.pair_scrcpy_save()}
          </Button>
        </div>
      </div>
    </div>
  );
}

function BehaviorSwitch({
  title,
  description,
  checked,
  ariaLabel,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  ariaLabel: string;
  onChange: (checked: boolean) => void;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch
        aria-label={ariaLabel}
        checked={checked}
        onCheckedChange={(value) => onChange(value)}
      />
    </div>
  );
}
