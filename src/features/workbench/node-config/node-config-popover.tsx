import { useState } from "react";
import {
  ScanLineIcon,
  Settings2Icon,
  XIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverPopup,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FLOW_NODE_DATA_PORTS, type JsonValue } from "@/shared/project-contracts";

import { BLOCK_DEFINITIONS } from "../blocks";
import type { FieldDefinition, WorkbenchNodeData } from "../types";
import { useWorkbench } from "../use-workbench";
import {
  FieldEditor,
  Section,
} from "./node-config-fields";

export function NodeConfigPopover({
  nodeId,
  data,
}: {
  nodeId: string;
  data: WorkbenchNodeData;
}) {
  const { flow, screens, screenRegionSelection } = useWorkbench();
  const [open, setOpen] = useState(false);

  const definition = BLOCK_DEFINITIONS[data.kind];
  const fields: FieldDefinition[] = definition?.fields ?? [];
  const dataPorts = FLOW_NODE_DATA_PORTS[data.kind];
  const inputPortByField = new Map(
    dataPorts.inputs.map((port) => [port.field ?? port.id, port]),
  );
  const inputFields = fields.filter((field) =>
    inputPortByField.has(field.name),
  );
  const settingFields = fields.filter(
    (field) => !inputPortByField.has(field.name),
  );
  const connectedInputIds = new Set(
    flow.edges
      .filter((edge) => edge.target === nodeId)
      .map((edge) => edge.targetHandle)
      .filter((handle): handle is string => typeof handle === "string"),
  );
  const Icon = definition?.icon;
  const selectingScreenRegion = screenRegionSelection.nodeId === nodeId;
  const canSelectScreenRegion =
    screens.screen?.streamId !== null &&
    screens.screen?.streamId !== undefined;

  const commit = (name: string, value: JsonValue) => {
    flow.updateNodeData(nodeId, { [name]: value });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button size="icon-xs" variant="ghost" aria-label="Configure block" />
        }
        className="nodrag nowheel"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <Settings2Icon />
      </PopoverTrigger>

      <PopoverPopup align="start" side="right" sideOffset={8}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">
                {definition?.label ?? "Block"}
              </div>
              <div className="truncate text-[10px] text-muted-foreground">
                {definition?.description ?? "Unknown block type"}
              </div>
            </div>
          </div>

          {inputFields.length > 0 && (
            <Section
              title="Data inputs"
              description="Use a local value, or connect a compatible upstream output."
            >
              {inputFields.map((field) => {
                const port = inputPortByField.get(field.name);
                return (
                  <FieldEditor
                    key={field.name}
                    field={field}
                    value={data[field.name]}
                    dataType={port?.dataType}
                    connected={port ? connectedInputIds.has(port.id) : false}
                    active={open}
                    onChange={(value) => commit(field.name, value)}
                  />
                );
              })}
            </Section>
          )}

          {data.kind === "screen-region" && (
            <Section
              title="Screen selection"
              description="Drag over the live display to capture x, y, width, and height."
            >
              <Button
                size="sm"
                variant={selectingScreenRegion ? "secondary" : "outline"}
                disabled={!canSelectScreenRegion && !selectingScreenRegion}
                onClick={() => {
                  if (selectingScreenRegion) {
                    screenRegionSelection.cancel();
                  } else {
                    screenRegionSelection.start(nodeId);
                  }
                }}
              >
                {selectingScreenRegion ? <XIcon /> : <ScanLineIcon />}
                {selectingScreenRegion ? "Cancel selection" : "Select on screen"}
              </Button>
              {!canSelectScreenRegion && (
                <p className="text-[10px] text-muted-foreground">
                  Start a display stream before selecting a region.
                </p>
              )}
            </Section>
          )}

          {settingFields.length > 0 && (
            <Section
              title="Settings"
              description="Node options that are not connectable data inputs."
            >
              {settingFields.map((field) => (
                <FieldEditor
                  key={field.name}
                  field={field}
                  value={data[field.name]}
                  active={open}
                  onChange={(value) => commit(field.name, value)}
                />
              ))}
            </Section>
          )}

        </div>
      </PopoverPopup>
    </Popover>
  );
}
