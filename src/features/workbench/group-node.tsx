import { useState } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { BoxSelectIcon, Trash2Icon } from "lucide-react";

import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages.js";

import { BLOCK_DEFINITIONS } from "./blocks";
import { useFlowApi } from "./flow/flow-api-context";
import { NodeConfigPopover } from "./node-config/node-config-popover";
import { BlockTitle, customNodeName } from "./node-title";
import type { WorkbenchNode } from "./types";

export function GroupNodeComponent({
  id,
  data,
  selected,
}: NodeProps<WorkbenchNode>) {
  const { deleteNode } = useFlowApi();
  const [configOpen, setConfigOpen] = useState(false);
  const definition = BLOCK_DEFINITIONS.group;
  const customName = customNodeName(data.name);
  const fallbackTitle = definition?.label ?? m.node_config_block_fallback();

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="block h-full"
        onContextMenu={(event) => event.stopPropagation()}
      >
        <div
          className={cn(
            "wb-node-group h-full rounded-lg border border-dashed border-muted-foreground/40 bg-muted/10",
            selected &&
              "border-primary shadow-[0_0_0_1px_var(--primary)] bg-primary/5",
          )}
        >
          <NodeResizer
            isVisible={selected}
            minWidth={140}
            minHeight={80}
            lineClassName="border-primary/50"
            handleClassName="!size-2.5 rounded-sm border border-primary bg-card"
          />
          <div className="flex items-center gap-1.5 px-2 py-1">
            <BoxSelectIcon
              aria-hidden="true"
              className="size-3.5 shrink-0 text-muted-foreground"
            />
            <div className="min-w-0 flex-1">
              <BlockTitle
                name={customName}
                fallback={fallbackTitle}
                onDoubleClick={() => setConfigOpen(true)}
              />
            </div>
            <NodeConfigPopover
              nodeId={id}
              data={data}
              open={configOpen}
              onOpenChange={setConfigOpen}
            />
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuPopup sideOffset={4}>
        <ContextMenuItem variant="destructive" onClick={() => deleteNode(id)}>
          <Trash2Icon />
          {m.block_node_delete_block()}
        </ContextMenuItem>
      </ContextMenuPopup>
    </ContextMenu>
  );
}