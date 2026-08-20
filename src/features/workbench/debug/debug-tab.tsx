import useAsync from "react-use/lib/useAsync";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { BugIcon, InfoIcon } from "lucide-react";

export function DebugSettingsTab() {
  const { value: system } = useAsync(
    () => window.androidPlatform.getSystemInfo(),
    [],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-2">
      <Alert variant="info" className="gap-1.5 px-2.5 py-2 text-xs">
        <InfoIcon />
        <AlertTitle className="text-xs">Background runtime</AlertTitle>
        <AlertDescription className="text-[11px]">
          The automation runtime is not implemented yet. Run stays disabled and
          blocks cannot execute until it exists.
        </AlertDescription>
      </Alert>

      <Alert variant="info" className="gap-1.5 px-2.5 py-2 text-xs">
        <InfoIcon />
        <AlertTitle className="text-xs">Screen capture</AlertTitle>
        <AlertDescription className="text-[11px]">
          scrcpy video is not wired up. The monitor panel will show a live frame
          once a capture source is configured.
        </AlertDescription>
      </Alert>

      <div className="rounded-lg border p-2">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium">
          <BugIcon className="size-3.5 text-muted-foreground" />
          Runtime &amp; system
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
          <dt className="text-muted-foreground">Runtime</dt>
          <dd>{system?.runtime ?? "—"}</dd>
          <dt className="text-muted-foreground">Platform</dt>
          <dd>{system?.platform ?? "—"}</dd>
          <dt className="text-muted-foreground">Electron</dt>
          <dd>{system?.versions.electron ?? "—"}</dd>
          <dt className="text-muted-foreground">Chrome</dt>
          <dd>{system?.versions.chrome ?? "—"}</dd>
          <dt className="text-muted-foreground">Node</dt>
          <dd>{system?.versions.node ?? "—"}</dd>
        </dl>
      </div>

      <div className="mt-auto flex items-center gap-2 text-[11px] text-muted-foreground">
        <Badge size="sm" variant="outline">
          graph
        </Badge>
        schema v1 · JSON persisted
      </div>
    </div>
  );
}
