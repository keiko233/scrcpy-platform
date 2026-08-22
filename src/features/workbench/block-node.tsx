import { Handle, Position, type NodeProps } from "@xyflow/react";
import { MinusIcon, PlusIcon, Trash2Icon } from "lucide-react";

import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import {
  FLOW_NODE_DATA_PORTS,
  FLOW_NODE_DYNAMIC_FLOW_INPUTS,
  FLOW_NODE_DYNAMIC_INPUTS,
  flowDynamicPortCount,
  flowDynamicPortId,
  type FlowDataType,
} from "@/shared/project-contracts";

import { BLOCK_DEFINITIONS } from "./blocks";
import { useFlowApi } from "./flow/flow-api-context";
import { NodeConfigPopover } from "./node-config/node-config-popover";
import { useWorkbench } from "./use-workbench";
import type { WorkbenchNode } from "./types";
import { m } from "@/paraglide/messages.js";

type NodePort = {
  id: string;
  label: string;
  dataType: FlowDataType | "flow";
};

const PORT_TYPE_CLASS_NAMES: Record<NodePort["dataType"], string> = {
  flow: "!bg-primary",
  any: "!bg-zinc-400",
  string: "!bg-emerald-500",
  number: "!bg-sky-500",
  boolean: "!bg-violet-500",
  "screen-region": "!bg-amber-500",
};

function getDataTypeLabel(type: NodePort["dataType"]): string {
  switch (type) {
    case "flow":
      return m.data_type_flow();
    case "any":
      return m.data_type_any();
    case "string":
      return m.data_type_string();
    case "number":
      return m.data_type_number();
    case "boolean":
      return m.data_type_boolean();
    case "screen-region":
      return m.data_type_screen_region();
    default:
      return type;
  }
}

function getPortDisplayLabel(
  kind: string,
  port: NodePort,
): string {
  if (port.dataType === "flow") {
    return port.label;
  }
  const key = `${kind}:${port.id}`;
  switch (key) {
    case "click:x":
      return m.port_click_x();
    case "click:y":
      return m.port_click_y();
    case "swipe:fromX":
      return m.port_swipe_from_x();
    case "swipe:fromY":
      return m.port_swipe_from_y();
    case "swipe:toX":
      return m.port_swipe_to_x();
    case "swipe:toY":
      return m.port_swipe_to_y();
    case "swipe:durationMs":
      return m.port_swipe_duration_ms();
    case "ocr:region":
      return m.port_ocr_region();
    case "ocr:expectedText":
      return m.port_ocr_expected_text();
    case "ocr:text":
      return m.port_ocr_text();
    case "ocr:confidence":
      return m.port_ocr_confidence();
    case "ocr:matched":
      return m.port_ocr_matched();
    case "delay:ms":
      return m.port_delay_ms();
    case "launch-app:packageName":
      return m.port_launch_app_package_name();
    case "launch-app:activity":
      return m.port_launch_app_activity();
    case "set-variable:expression":
      return m.port_set_variable_expression();
    case "set-variable:value":
      return m.port_set_variable_value();
    case "calculate:value":
      return m.port_calculate_value();
    case "if:condition":
      return m.port_if_condition();
    case "for:from":
      return m.port_for_from();
    case "for:to":
      return m.port_for_to();
    case "for:step":
      return m.port_for_step();
    case "for:index":
      return m.port_for_index();
    case "while:condition":
      return m.port_while_condition();
    case "assert:condition":
      return m.port_assert_condition();
    case "assert:message":
      return m.port_assert_message();
    case "screen-region:region":
      return m.port_screen_region_region();
    default:
      return port.label;
  }
}

function PortType({ type }: { type: NodePort["dataType"] }) {
  return (
    <span
      className={cn(
        "rounded px-1 py-px text-[8px] font-medium uppercase leading-none",
        type === "flow" && "bg-primary/12 text-primary",
        type === "any" && "bg-zinc-500/12 text-zinc-500",
        type === "string" && "bg-emerald-500/12 text-emerald-600",
        type === "number" && "bg-sky-500/12 text-sky-600",
        type === "boolean" && "bg-violet-500/12 text-violet-600",
        type === "screen-region" && "bg-amber-500/12 text-amber-600",
      )}
    >
      {getDataTypeLabel(type)}
    </span>
  );
}

export function BlockNodeComponent({ id, data, selected }: NodeProps<WorkbenchNode>) {
  const { deleteNode, updateNodeData } = useFlowApi();
  const { runs, flow } = useWorkbench();
  const definition = BLOCK_DEFINITIONS[data.kind];
  const Icon = definition?.icon;
  const title = definition?.label ?? String(data.kind ?? m.node_config_block_fallback());
  const summary = definition ? definition.summarize(data) : m.block_summarize_unknown();
  const isBreakpoint = runs.breakpoints.has(id);
  const isPaused = runs.run?.state === "paused" && runs.run.currentNodeId === id;
  const isCurrent = runs.run?.state === "running" && runs.run.currentNodeId === id;
  const dataPorts = FLOW_NODE_DATA_PORTS[data.kind];
  const dynamicFlowConfig = FLOW_NODE_DYNAMIC_FLOW_INPUTS[data.kind];
  const dynamicDataConfig = FLOW_NODE_DYNAMIC_INPUTS[data.kind];
  const dynamicCount = flowDynamicPortCount(data.kind, data) ?? 0;
  const dynamicIds = Array.from({ length: dynamicCount }, (_, index) =>
    flowDynamicPortId(index),
  );
  const inputPorts: NodePort[] = [
    ...(definition?.inputPorts ?? []).map((portId) => ({
      id: portId,
      label: portId,
      dataType: "flow" as const,
    })),
    ...(dynamicFlowConfig !== undefined
      ? dynamicIds.map((portId) => ({
          id: portId,
          label: portId,
          dataType: "flow" as const,
        }))
      : []),
    ...dataPorts.inputs,
    ...(dynamicDataConfig !== undefined
      ? dynamicIds.map((portId) => ({
          id: portId,
          label: portId,
          dataType: dynamicDataConfig.dataType,
        }))
      : []),
  ];
  const outputPorts: NodePort[] = [
    ...(definition?.outputPorts ?? []).map((portId) => ({
      id: portId,
      label: portId,
      dataType: "flow" as const,
    })),
    ...dataPorts.outputs,
  ];
  const portRows = Array.from(
    { length: Math.max(inputPorts.length, outputPorts.length) },
    (_, index) => ({ input: inputPorts[index], output: outputPorts[index] }),
  );

  const dynamicConfig = dynamicFlowConfig ?? dynamicDataConfig;
  const addDynamicInput = () => {
    if (dynamicConfig !== undefined && dynamicCount < dynamicConfig.max) {
      updateNodeData(id, { [dynamicConfig.countField]: dynamicCount + 1 });
    }
  };
  const removeDynamicInput = () => {
    if (dynamicConfig === undefined || dynamicCount <= dynamicConfig.min) {
      return;
    }
    const removedPortId = dynamicIds[dynamicCount - 1];
    const removedEdgeIds = flow.edges
      .filter(
        (edge) =>
          edge.target === id &&
          (edge.targetHandle ?? null) === removedPortId,
      )
      .map((edge) => edge.id);
    if (removedEdgeIds.length > 0) {
      flow.onEdgesChange(
        removedEdgeIds.map((edgeId) => ({ type: "remove", id: edgeId })),
      );
    }
    updateNodeData(id, { [dynamicConfig.countField]: dynamicCount - 1 });
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="block"
        onContextMenu={(event) => event.stopPropagation()}
      >
        <div
          className={cn(
            "wb-flow-node !p-0",
            selected && "selected",
            definition?.kind && `wb-block-${definition.kind}`,
            isPaused && "ring-2 ring-warning",
            isCurrent && "ring-2 ring-primary",
          )}
        >
          <div className="flex items-center gap-2 rounded-t-[calc(var(--radius-md)-1px)] border-b bg-muted/50 px-2 py-1.5">
            <button
              type="button"
              className="group/breakpoint flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent"
              title={isBreakpoint ? m.block_node_remove_breakpoint() : m.block_node_add_breakpoint()}
              aria-label={isBreakpoint ? m.block_node_remove_breakpoint() : m.block_node_add_breakpoint()}
              aria-pressed={isBreakpoint}
              onClick={() => runs.toggleBreakpoint(id)}
            >
              <span
                className={cn(
                  "size-2.5 rounded-full border",
                  isBreakpoint
                    ? "border-destructive bg-destructive"
                    : "border-muted-foreground/50 bg-transparent group-hover/breakpoint:border-muted-foreground",
                )}
              />
            </button>
            {Icon && (
              <Icon
                aria-hidden="true"
                className="size-3.5 shrink-0 text-muted-foreground"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium leading-4">
                {title}
              </div>
              <div
                className="truncate text-[10px] leading-3.5 text-muted-foreground"
                title={summary}
              >
                {summary}
              </div>
            </div>
            {definition.fields.length > 0 && (
              <NodeConfigPopover nodeId={id} data={data} />
            )}
          </div>
          {portRows.length > 0 && (
            <div className="py-1">
              {portRows.map((row, index) => {
                const inputLabel = row.input ? getPortDisplayLabel(data.kind, row.input) : "";
                const outputLabel = row.output ? getPortDisplayLabel(data.kind, row.output) : "";
                return (
                  <div
                    key={`${row.input?.id ?? ""}:${row.output?.id ?? ""}:${index}`}
                    className="grid min-h-5 grid-cols-2 text-[10px]"
                  >
                    <div className="relative flex min-w-0 items-center gap-1.5 pl-2 pr-1">
                      {row.input && (
                        <>
                          <Handle
                            id={row.input.id}
                            type="target"
                            position={Position.Left}
                            className={cn(
                              "!left-0 !top-1/2 !size-3",
                              PORT_TYPE_CLASS_NAMES[row.input.dataType],
                            )}
                            title={`${inputLabel}: ${getDataTypeLabel(row.input.dataType)}`}
                            aria-label={`Input ${inputLabel}, type ${getDataTypeLabel(row.input.dataType)}`}
                          />
                          <span className="truncate" title={inputLabel}>
                            {inputLabel}
                          </span>
                          <PortType type={row.input.dataType} />
                        </>
                      )}
                    </div>
                    <div className="relative flex min-w-0 items-center justify-end gap-1.5 pl-1 pr-2 text-right">
                      {row.output && (
                        <>
                          <PortType type={row.output.dataType} />
                          <span className="truncate" title={outputLabel}>
                            {outputLabel}
                          </span>
                          <Handle
                            id={row.output.id}
                            type="source"
                            position={Position.Right}
                            className={cn(
                              "!right-0 !top-1/2 !size-3",
                              PORT_TYPE_CLASS_NAMES[row.output.dataType],
                            )}
                            title={`${outputLabel}: ${getDataTypeLabel(row.output.dataType)}`}
                            aria-label={`Output ${outputLabel}, type ${getDataTypeLabel(row.output.dataType)}`}
                          />
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {dynamicConfig !== undefined && (
            <div className="flex items-center justify-center gap-1 border-t bg-muted/30 py-0.5">
              <button
                type="button"
                className="nodrag flex size-4 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                title={m.block_node_add_input()}
                aria-label={m.block_node_add_input()}
                disabled={dynamicCount >= dynamicConfig.max}
                onClick={addDynamicInput}
              >
                <PlusIcon className="size-3" />
              </button>
              <button
                type="button"
                className="nodrag flex size-4 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                title={m.block_node_remove_input()}
                aria-label={m.block_node_remove_input()}
                disabled={dynamicCount <= dynamicConfig.min}
                onClick={removeDynamicInput}
              >
                <MinusIcon className="size-3" />
              </button>
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuPopup align="center" sideOffset={4}>
        <ContextMenuItem variant="destructive" onClick={() => deleteNode(id)}>
          <Trash2Icon />
          {m.block_node_delete_block()}
        </ContextMenuItem>
      </ContextMenuPopup>
    </ContextMenu>
  );
}
