import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Trash2Icon } from "lucide-react";

import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";

import { BLOCK_DEFINITIONS } from "./blocks";
import { useFlowApi } from "./flow/flow-api-context";
import type { WorkbenchNode } from "./types";

export function BlockNodeComponent({ id, data, selected }: NodeProps<WorkbenchNode>) {
  const { deleteNode } = useFlowApi();
  const definition = BLOCK_DEFINITIONS[data.kind];
  const Icon = definition?.icon;
  const title = definition?.label ?? String(data.kind ?? "block");
  const summary = definition ? definition.summarize(data) : "Unknown block";

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="block"
        onContextMenu={(event) => event.stopPropagation()}
      >
        <div
          className={cn(
            "wb-flow-node",
            selected && "selected",
            definition?.kind && `wb-block-${definition.kind}`,
          )}
        >
          <Handle className="!-left-[5px]" type="target" position={Position.Left} />
          <div className="flex items-center gap-2">
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
          </div>
          <Handle
            className="!-right-[5px]"
            type="source"
            position={Position.Right}
          />
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
