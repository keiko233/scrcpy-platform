import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Trash2Icon } from "lucide-react";

import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import {
  FLOW_DATA_TYPE_LABELS,
  FLOW_NODE_DATA_PORTS,
  type FlowDataType,
} from "@/shared/project-contracts";

import { BLOCK_DEFINITIONS } from "./blocks";
import { useFlowApi } from "./flow/flow-api-context";
import { NodeConfigPopover } from "./node-config/node-config-popover";
import { useWorkbench } from "./use-workbench";
import type { WorkbenchNode } from "./types";

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
      {type === "flow" ? "Flow" : FLOW_DATA_TYPE_LABELS[type]}
    </span>
  );
}

export function BlockNodeComponent({ id, data, selected }: NodeProps<WorkbenchNode>) {
  const { deleteNode } = useFlowApi();
  const { runs } = useWorkbench();
  const definition = BLOCK_DEFINITIONS[data.kind];
  const Icon = definition?.icon;
  const title = definition?.label ?? String(data.kind ?? "block");
  const summary = definition ? definition.summarize(data) : "Unknown block";
  const isBreakpoint = runs.breakpoints.has(id);
  const isPaused = runs.run?.state === "paused" && runs.run.currentNodeId === id;
  const isCurrent = runs.run?.state === "running" && runs.run.currentNodeId === id;
  const dataPorts = FLOW_NODE_DATA_PORTS[data.kind];
  const inputPorts: NodePort[] = [
    ...(definition?.inputPorts ?? []).map((id) => ({
      id,
      label: id,
      dataType: "flow" as const,
    })),
    ...dataPorts.inputs,
  ];
  const outputPorts: NodePort[] = [
    ...(definition?.outputPorts ?? []).map((id) => ({
      id,
      label: id,
      dataType: "flow" as const,
    })),
    ...dataPorts.outputs,
  ];
  const portRows = Array.from(
    { length: Math.max(inputPorts.length, outputPorts.length) },
    (_, index) => ({ input: inputPorts[index], output: outputPorts[index] }),
  );

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
              title={
                isBreakpoint ? "Remove breakpoint" : "Add breakpoint"
              }
              aria-label={
                isBreakpoint ? "Remove breakpoint" : "Add breakpoint"
              }
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
              {portRows.map((row, index) => (
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
                          title={`${row.input.label}: ${row.input.dataType}`}
                          aria-label={`Input ${row.input.label}, type ${row.input.dataType}`}
                        />
                        <span className="truncate" title={row.input.label}>
                          {row.input.label}
                        </span>
                        <PortType type={row.input.dataType} />
                      </>
                    )}
                  </div>
                  <div className="relative flex min-w-0 items-center justify-end gap-1.5 pl-1 pr-2 text-right">
                    {row.output && (
                      <>
                        <PortType type={row.output.dataType} />
                        <span className="truncate" title={row.output.label}>
                          {row.output.label}
                        </span>
                        <Handle
                          id={row.output.id}
                          type="source"
                          position={Position.Right}
                          className={cn(
                            "!right-0 !top-1/2 !size-3",
                            PORT_TYPE_CLASS_NAMES[row.output.dataType],
                          )}
                          title={`${row.output.label}: ${row.output.dataType}`}
                          aria-label={`Output ${row.output.label}, type ${row.output.dataType}`}
                        />
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuPopup align="center" sideOffset={4}>
        <ContextMenuItem variant="destructive" onClick={() => deleteNode(id)}>
          <Trash2Icon />
          Delete block
        </ContextMenuItem>
      </ContextMenuPopup>
    </ContextMenu>
  );
}
