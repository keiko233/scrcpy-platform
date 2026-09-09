import { SettingsIcon } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSystemInfo } from "@/hooks/query/use-system-info";
import {
  useScrcpyScopeView,
  useSetScrcpyGlobalSettings,
} from "@/hooks/query/use-scrcpy-settings";
import { useLanguage } from "@/i18n/language";
import { m } from "@/paraglide/messages.js";
import type { ScrcpySettings } from "@/shared/screen-contracts";
import { StorageKey } from "@/shared/constants/enums";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { ScrcpyScopedSettingsCard } from "@/features/settings/scrcpy-scoped-settings";

export function SettingsScreen() {
  const { language, setLanguage } = useLanguage();
  const [allowUnsavedRun, setAllowUnsavedRun] = useState(
    () => window.localStorage.getItem(StorageKey.WorkbenchAllowUnsavedRun) === "true",
  );
  const infoQuery = useSystemInfo();
  const globalScope = { scope: "global" as const };
  const globalViewQuery = useScrcpyScopeView(globalScope);
  const setGlobalSettings = useSetScrcpyGlobalSettings();
  const info = infoQuery.data ?? null;
  const globalSettings = globalViewQuery.data?.resolved;

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4 text-xs">
      <header className="mb-3 flex items-center gap-2">
        <SettingsIcon className="size-4 text-muted-foreground" />
        <h1 className="text-sm font-semibold">{m.settings_title()}</h1>
      </header>

      <div className="grid max-w-3xl gap-3">
        <section className="rounded-lg border p-3">
          <h2 className="mb-2 font-medium">{m.settings_language_title()}</h2>
          <p className="mb-2 text-muted-foreground">
            {m.settings_language_description()}
          </p>
          <Select
            value={language}
            onValueChange={(value) => {
              if (value !== null) {
                setLanguage(value as typeof language);
              }
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {language === "zh-cn" ? m.settings_language_chinese() : m.settings_language_english()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">{m.settings_language_english()}</SelectItem>
              <SelectItem value="zh-cn">{m.settings_language_chinese()}</SelectItem>
            </SelectContent>
          </Select>
        </section>

        <section className="rounded-lg border p-3">
          <h2 className="mb-2 font-medium">{m.settings_run_title()}</h2>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">{m.settings_allow_unsaved_run_title()}</p>
              <p className="mt-1 text-muted-foreground">
                {m.settings_allow_unsaved_run_description()}
              </p>
            </div>
            <Switch
              checked={allowUnsavedRun}
              onCheckedChange={(checked) => {
                setAllowUnsavedRun(checked);
                window.localStorage.setItem(
                  StorageKey.WorkbenchAllowUnsavedRun,
                  String(checked),
                );
              }}
              aria-label={m.settings_allow_unsaved_run_title()}
            />
          </div>
        </section>

        <ScrcpyScopedSettingsCard />

        <section className="rounded-lg border p-3">
          <h2 className="mb-2 font-medium">{m.settings_ocr_title()}</h2>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="font-medium">{m.settings_ocr_capture_source()}</p>
              <p className="mt-1 text-muted-foreground">
                {m.settings_ocr_capture_source_description()}
              </p>
            </div>
            <Select
              value={globalSettings?.ocrCaptureSource ?? "scrcpy"}
              disabled={
                globalSettings === undefined || setGlobalSettings.isPending
              }
              onValueChange={(value) => {
                if (value === null || globalSettings === undefined) {
                  return;
                }
                void setGlobalSettings
                  .mutateAsync({
                    ...globalSettings,
                    ocrCaptureSource:
                      value as ScrcpySettings["ocrCaptureSource"],
                  })
                  .catch(() => undefined);
              }}
            >
              <SelectTrigger className="w-48" aria-label={m.settings_ocr_capture_source()}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scrcpy">
                  {m.settings_ocr_capture_source_scrcpy()}
                </SelectItem>
                <SelectItem value="screencap">
                  {m.settings_ocr_capture_source_screencap()}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>

        <section className="rounded-lg border p-3">
          <h2 className="mb-2 font-medium">{m.settings_system_title()}</h2>
          <dl className="grid gap-1.5 text-muted-foreground">
            <div className="flex justify-between gap-4">
              <dt>{m.settings_system_runtime()}</dt>
              <dd>{info?.runtime ?? "…"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{m.settings_system_platform()}</dt>
              <dd>{info?.platform ?? "…"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{m.settings_system_electron()}</dt>
              <dd>{info?.versions.electron ?? "…"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{m.settings_system_chromium()}</dt>
              <dd>{info?.versions.chrome ?? "…"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{m.settings_system_node()}</dt>
              <dd>{info?.versions.node ?? "…"}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
