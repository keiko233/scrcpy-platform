import { useState } from "react";
import {
  CrosshairIcon,
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
  CallTargetEditor,
  DefaultValueEditor,
  ParamListEditor,
  ResultListEditor,
} from "./callable-editors";
import {
  FieldEditor,
  Section,
} from "./node-config-fields";
import { m } from "@/paraglide/messages.js";

export function NodeConfigPopover({
  nodeId,
  data,
  open,
  onOpenChange,
}: {
  nodeId: string;
  data: WorkbenchNodeData;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { flow, screens, screenRegionSelection, screenPointSelection } = useWorkbench();
  const [internalOpen, setInternalOpen] = useState(false);
  const controlled = open !== undefined;
  const isOpen = controlled ? open : internalOpen;
  const setOpen = (next: boolean) => {
    if (controlled) {
      onOpenChange?.(next);
    } else {
      setInternalOpen(next);
    }
  };

  const definition = BLOCK_DEFINITIONS[data.kind];
  const fields: FieldDefinition[] = (definition?.fields ?? []).filter(
    (field) => field.visible?.(data) ?? true,
  );
  const dataPorts = FLOW_NODE_DATA_PORTS[data.kind];
  const inputPortByField = new Map(dataPorts.inputs.map((port) => [port.field ?? port.id, port]));
  const inputFields = fields.filter((field) => inputPortByField.has(field.name));
  const settingFields = fields.filter((field) => !inputPortByField.has(field.name));
  const boundaryFields = settingFields.filter(
    (field) => field.kind === "param-list" || field.kind === "result-list",
  );
  const plainSettingFields = settingFields.filter(
    (field) => field.kind !== "param-list" && field.kind !== "result-list",
  );
  const connectedInputIds = new Set(
    flow.edges
      .filter((edge) => edge.target === nodeId)
      .map((edge) => edge.targetHandle)
      .filter((handle): handle is string => typeof handle === "string"),
  );
  const Icon = definition?.icon;
  const selectingScreenRegion = screenRegionSelection.nodeId === nodeId;
  const selectingScreenPoint = screenPointSelection.nodeId === nodeId;
  const canSelectOnScreen =
    screens.screen?.streamId !== null && screens.screen?.streamId !== undefined;

  const commit = (name: string, value: JsonValue) => {
    flow.updateNodeData(nodeId, { [name]: value });
  };

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button size="icon-xs" variant="ghost" aria-label={m.node_config_configure_block_aria()} />}
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
                {definition?.label ?? m.node_config_block_fallback()}
              </div>
              <div className="truncate text-[10px] text-muted-foreground">
                {definition?.description ?? m.node_config_unknown_block()}
              </div>
            </div>
          </div>

          <Section
            title={m.node_config_name_label()}
            description={m.node_config_name_description()}
          >
            <FieldEditor
              field={{
                name: "name",
                label: m.node_config_name_label(),
                kind: "text",
                placeholder: m.node_config_name_placeholder(),
              }}
              value={data.name}
              onChange={(value) => commit("name", value)}
            />
          </Section>

          {inputFields.length > 0 && (
            <Section
              title={m.node_config_data_inputs()}
              description={m.node_config_data_inputs_description()}
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
                    onChange={(value) => commit(field.name, value)}
                  />
                );
              })}
            </Section>
          )}

          {data.kind === "screen-region" && (
            <Section
              title={m.node_config_screen_selection()}
              description={m.node_config_screen_region_description()}
            >
              <Button
                size="sm"
                variant={selectingScreenRegion ? "secondary" : "outline"}
                disabled={!canSelectOnScreen && !selectingScreenRegion}
                onClick={() => {
                  if (selectingScreenRegion) {
                    screenRegionSelection.cancel();
                  } else {
                    setOpen(false);
                    screenRegionSelection.start(nodeId);
                  }
                }}
              >
                {selectingScreenRegion ? <XIcon /> : <ScanLineIcon />}
                {selectingScreenRegion ? m.node_config_cancel_selection() : m.node_config_select_on_screen()}
              </Button>
              {!canSelectOnScreen && (
                <p className="text-[10px] text-muted-foreground">{m.node_config_start_stream_for_region()}</p>
              )}
            </Section>
          )}

          {data.kind === "click" && (
            <Section
              title={m.node_config_screen_selection()}
              description={m.node_config_screen_point_description()}
            >
              <Button
                size="sm"
                variant={selectingScreenPoint ? "secondary" : "outline"}
                disabled={!canSelectOnScreen && !selectingScreenPoint}
                onClick={() => {
                  if (selectingScreenPoint) {
                    screenPointSelection.cancel();
                  } else {
                    setOpen(false);
                    screenPointSelection.start(nodeId);
                  }
                }}
              >
                {selectingScreenPoint ? <XIcon /> : <CrosshairIcon />}
                {selectingScreenPoint ? m.node_config_cancel_selection() : m.node_config_select_point()}
              </Button>
              {!canSelectOnScreen && (
                <p className="text-[10px] text-muted-foreground">{m.node_config_start_stream_for_point()}</p>
              )}
            </Section>
          )}

          {boundaryFields.map((field) => {
            if (field.kind === "param-list") {
              return (
                <Section
                  key={field.name}
                  title={m.node_config_params_title()}
                  description={m.node_config_params_description()}
                >
                  <ParamListEditor
                    value={data[field.name]}
                    onChange={(value) => commit(field.name, value)}
                  />
                </Section>
              );
            }
            return (
              <Section
                key={field.name}
                title={m.node_config_results_title()}
                description={m.node_config_results_description()}
              >
                <ResultListEditor
                  value={data[field.name]}
                  onChange={(value) => commit(field.name, value)}
                />
              </Section>
            );
          })}

          {plainSettingFields.length > 0 && (
            <Section
              title={m.node_config_settings_title()}
              description={m.node_config_settings_description()}
            >
              {plainSettingFields.map((field) => {
                if (field.kind === "call-target") {
                  return (
                    <CallTargetEditor
                      key={field.name}
                      value={data[field.name]}
                      onChange={(value) => commit(field.name, value)}
                    />
                  );
                }
                if (field.kind === "default-value") {
                  const dataType = data.dataType;
                  return (
                    <DefaultValueEditor
                      key={field.name}
                      dataType={
                        dataType === "string" ||
                        dataType === "number" ||
                        dataType === "boolean" ||
                        dataType === "screen-region"
                          ? dataType
                          : "any"
                      }
                      value={data[field.name]}
                      onChange={(value) => commit(field.name, value)}
                    />
                  );
                }
                return (
                  <FieldEditor
                    key={field.name}
                    field={field}
                    value={data[field.name]}
                    onChange={(value) => commit(field.name, value)}
                  />
                );
              })}
            </Section>
          )}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
