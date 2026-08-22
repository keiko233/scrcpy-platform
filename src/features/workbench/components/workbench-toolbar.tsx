import { MenuItem, MenuPopup, MenuTrigger, Menu as MenuRoot } from "@/components/ui/menu";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  PlayIcon,
  PlusIcon,
  SaveIcon,
  ShieldAlertIcon,
  SquareIcon,
} from "lucide-react";
import { BLOCK_DEFINITIONS, FLOW_BLOCK_KIND_ORDER } from "../blocks";
import { useWorkbench } from "../use-workbench";

export function WorkbenchToolbar() {
  const { library, flow, devices, screens, runs } = useWorkbench();
  const { selectedProject, selectedScript } = library;

  const canSave =
    selectedScript !== null &&
    flow.dirty &&
    flow.saveState === "idle" &&
    flow.error === null;
  const running = runs.run?.state === "running" || runs.run?.state === "paused";
  const session = devices.session;
  const displayId = screens.screen?.activeDisplayId ?? null;
  const canRun =
    selectedScript !== null &&
    !flow.dirty &&
    !runs.busy &&
    session?.state === "connected" &&
    session.transportId !== null &&
    displayId !== null;

  const runTooltip = running
    ? "Stop the active flow run"
    : runs.error ??
      (selectedScript === null
        ? "Select a script to run"
        : flow.dirty
          ? "Save the draft before running it"
          : session?.state !== "connected"
            ? "Connect an Android device before running"
            : displayId === null
              ? "Select an Android display before running"
              : "Run the saved flow in the background");

  const toggleRun = () => {
    if (running) {
      void runs.stop();
      return;
    }
    if (
      !canRun ||
      selectedScript === null ||
      session?.transportId === null ||
      session?.transportId === undefined ||
      displayId === null
    ) {
      return;
    }
    void runs.start({
      scriptId: selectedScript.id,
      deviceId: session.transportId,
      sessionId: session.sessionId,
      displayId,
    });
  };

  return (
    <div className="flex h-9 shrink-0 items-center gap-1.5 border-b bg-card px-2">
      <div className="flex min-w-0 items-center gap-2 pr-2">
        <ShieldAlertIcon className="size-4 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-col leading-none">
          <span className="truncate text-xs font-semibold">
            Android Automation
          </span>
          <span className="truncate text-[10px] text-muted-foreground">
            {selectedProject ? selectedProject.name : "no project"}
            {selectedScript ? ` · ${selectedScript.name}` : ""}
          </span>
        </div>
      </div>

      <div className="h-5 w-px shrink-0 bg-border" />

      <span
        className={cn(
          "flex items-center gap-1.5 text-xs",
          flow.dirty ? "text-warning-foreground" : "text-muted-foreground",
        )}
        aria-live="polite"
      >
        <span
          className={cn(
            "size-1.5 rounded-full",
            flow.dirty ? "bg-warning" : "bg-border",
          )}
        />
        {selectedScript === null
          ? "No script"
          : flow.dirty
            ? "Unsaved changes"
            : "Saved"}
      </span>

      <div className="flex-1" />

      <MenuRoot>
        <MenuTrigger
          render={
            <Button
              size="sm"
              variant="outline"
              disabled={selectedScript === null}
            >
              <PlusIcon />
              Block
            </Button>
          }
        />
        <MenuPopup align="end">
          {FLOW_BLOCK_KIND_ORDER.map((kind) => {
            const definition = BLOCK_DEFINITIONS[kind];
            const Icon = definition.icon;
            return (
              <MenuItem key={kind} onClick={() => flow.addBlock(kind)}>
                <Icon />
                {definition.label}
              </MenuItem>
            );
          })}
        </MenuPopup>
      </MenuRoot>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="sm"
              variant="default"
              loading={flow.saveState === "saving"}
              disabled={!canSave}
              onClick={() => void flow.save()}
            >
              <SaveIcon />
              Save
            </Button>
          }
        />
        <TooltipContent>
          {flow.saveState === "saving"
            ? "Saving…"
            : canSave
              ? "Save the current graph"
              : selectedScript === null
                ? "Select a script to save"
                : "Nothing to save"}
        </TooltipContent>
      </Tooltip>

      <div className="h-5 w-px shrink-0 bg-border" />

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="sm"
              variant={running ? "destructive-outline" : "outline"}
              loading={runs.busy}
              disabled={running ? runs.busy : !canRun}
              aria-label={running ? "Stop flow" : "Run flow"}
              onClick={toggleRun}
            >
              {running ? <SquareIcon /> : <PlayIcon />}
              {running ? "Stop" : "Run"}
            </Button>
          }
        />
        <TooltipContent>
          {runTooltip}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
