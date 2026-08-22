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
import { m } from "@/paraglide/messages.js";

export function WorkbenchToolbar() {
  const { library, flow, devices, screens, runs } = useWorkbench();
  const { selectedProject, selectedScript } = library;

  const canSave =
    selectedScript !== null && flow.dirty && flow.saveState === "idle" && flow.error === null;
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
    ? m.workbench_toolbar_stop_active_run()
    : (runs.error ??
      (selectedScript === null
        ? m.run_panel_select_script_to_run()
        : flow.dirty
          ? m.run_panel_save_before_run()
          : session?.state !== "connected"
            ? m.run_panel_connect_device_before_run()
            : displayId === null
              ? m.run_panel_select_display_before_run()
              : m.workbench_toolbar_run_saved_flow()));

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
          <span className="truncate text-xs font-semibold">{m.workbench_toolbar_title()}</span>
          <span className="truncate text-[10px] text-muted-foreground">
            {selectedProject ? selectedProject.name : m.workbench_toolbar_no_project()}
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
        <span className={cn("size-1.5 rounded-full", flow.dirty ? "bg-warning" : "bg-border")} />
        {selectedScript === null
          ? m.workbench_toolbar_no_script()
          : flow.dirty
            ? m.workbench_toolbar_unsaved_changes()
            : m.workbench_toolbar_saved()}
      </span>

      <div className="flex-1" />

      <MenuRoot>
        <MenuTrigger
          render={
            <Button size="sm" variant="outline" disabled={selectedScript === null}>
              <PlusIcon />
              {m.workbench_toolbar_block()}
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
              {m.workbench_toolbar_save()}
            </Button>
          }
        />
        <TooltipContent>
          {flow.saveState === "saving"
            ? m.workbench_toolbar_saving()
            : canSave
              ? m.workbench_toolbar_save_current_graph()
              : selectedScript === null
                ? m.workbench_toolbar_select_script_to_save()
                : m.workbench_toolbar_nothing_to_save()}
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
              aria-label={running ? m.workbench_toolbar_stop_flow_aria() : m.workbench_toolbar_run_flow_aria()}
              onClick={toggleRun}
            >
              {running ? <SquareIcon /> : <PlayIcon />}
              {running ? m.workbench_toolbar_stop() : m.workbench_toolbar_run()}
            </Button>
          }
        />
        <TooltipContent>{runTooltip}</TooltipContent>
      </Tooltip>
    </div>
  );
}
