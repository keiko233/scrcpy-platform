import { SettingsIcon } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSystemInfo } from "@/hooks/query/use-system-info";
import { useLanguage } from "@/i18n/language";
import { m } from "@/paraglide/messages.js";

export function SettingsScreen() {
  const { language, setLanguage } = useLanguage();
  const infoQuery = useSystemInfo();
  const info = infoQuery.data ?? null;

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4 text-xs">
      <header className="mb-3 flex items-center gap-2">
        <SettingsIcon className="size-4 text-muted-foreground" />
        <h1 className="text-sm font-semibold">{m.settings_title()}</h1>
      </header>

      <div className="grid max-w-md gap-3">
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
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">{m.settings_language_english()}</SelectItem>
              <SelectItem value="zh-cn">{m.settings_language_chinese()}</SelectItem>
            </SelectContent>
          </Select>
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

        <p className="text-muted-foreground">{m.settings_coming_soon()}</p>
      </div>
    </div>
  );
}
