import { useNavigate } from "@tanstack/react-router";
import { MonitorIcon, SmartphoneIcon, XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AndroidDisplayDto } from "@/shared/screen-contracts";

import { VirtualDisplayMenu } from "@/features/workbench/screen/virtual-display-menu";
import { useWorkbench } from "@/features/workbench/use-workbench";

function labelFor(display: AndroidDisplayDto): string {
  if (display.kind === "virtual") {
    return "Virtual";
  }
  return display.primary ? "Primary Physical" : "Physical";
}

export function DisplayTabs() {
  const { screens, devices } = useWorkbench();
  const navigate = useNavigate();
  const connected = devices.session?.state === "connected";
  const displays = screens.screen?.displays ?? [];
  const activeId = screens.screen?.activeDisplayId ?? null;

  return (
    <div className="app-no-drag flex h-full items-center gap-0.5 px-1.5">
      {displays.map((display) => {
        const active = display.displayId === activeId;
        const Icon = display.kind === "virtual" ? MonitorIcon : SmartphoneIcon;
        return (
          <button
            key={display.displayId}
            type="button"
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
            onClick={() => {
              void screens.selectDisplay(display.displayId);
              void navigate({ to: "/$tab", params: { tab: "workbench" } });
            }}
            title={display.name}
          >
            <Icon className="size-3.5" />
            <span>{labelFor(display)}</span>
            {display.ownedBySession && (
              <span
                aria-label="Destroy virtual display"
                className="ml-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive hover:text-white"
                onClick={(event) => {
                  event.stopPropagation();
                  void screens.destroyVirtualDisplay();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.stopPropagation();
                    event.preventDefault();
                    void screens.destroyVirtualDisplay();
                  }
                }}
                role="button"
                tabIndex={0}
                title="Destroy virtual display"
              >
                <XIcon className="size-3" />
              </span>
            )}
          </button>
        );
      })}

      {connected && <VirtualDisplayMenu connected={connected} />}
    </div>
  );
}
