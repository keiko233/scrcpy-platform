import { MenuItem, MenuPopup, MenuTrigger, Menu as MenuRoot } from "@/components/ui/menu";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  PlayIcon,
  PlusIcon,
  SaveIcon,
  ShieldAlertIcon,
} from "lucide-react";
import { BLOCK_DEFINITIONS, FLOW_BLOCK_KIND_ORDER } from "../blocks";
import { useWorkbench } from "../use-workbench";

export function WorkbenchToolbar() {
  const { library, flow } = useWorkbench();
  const { selectedProject, selectedScript } = library;

  const canSave =
    selectedScript !== null &&
    flow.dirty &&
    flow.saveState === "idle" &&
    flow.error === null;

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
            <Button size="sm" variant="outline" disabled aria-label="Run flow">
              <PlayIcon />
              Run
            </Button>
          }
        />
        <TooltipContent>
          Run is unavailable: the background runtime is not implemented yet.
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
