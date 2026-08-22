import { useEffect, useState } from "react";
import { SettingsIcon } from "lucide-react";

import type { SystemInfo } from "@/shared/electron-api";

export function SettingsScreen() {
  const [info, setInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    let active = true;
    void window.androidPlatform.getSystemInfo().then((value) => {
      if (active) {
        setInfo(value);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4 text-xs">
      <header className="mb-3 flex items-center gap-2">
        <SettingsIcon className="size-4 text-muted-foreground" />
        <h1 className="text-sm font-semibold">Settings</h1>
      </header>

      <div className="grid max-w-md gap-3">
        <section className="rounded-lg border p-3">
          <h2 className="mb-2 font-medium">System</h2>
          <dl className="grid gap-1.5 text-muted-foreground">
            <div className="flex justify-between gap-4">
              <dt>Runtime</dt>
              <dd>{info?.runtime ?? "…"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Platform</dt>
              <dd>{info?.platform ?? "…"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Electron</dt>
              <dd>{info?.versions.electron ?? "…"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Chromium</dt>
              <dd>{info?.versions.chrome ?? "…"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Node</dt>
              <dd>{info?.versions.node ?? "…"}</dd>
            </div>
          </dl>
        </section>

        <p className="text-muted-foreground">More settings are coming soon.</p>
      </div>
    </div>
  );
}
