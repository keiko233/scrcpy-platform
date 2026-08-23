import { useState } from "react";
import {
  NodeResizer,
  useReactFlow,
  type NodeProps,
  type XYPosition,
} from "@xyflow/react";
import { BoxSelectIcon, Trash2Icon } from "lucide-react";

import {
  ContextMenu,
  ContextMenuGroup,
  ContextMenuGroupLabel,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubPopup,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages.js";

import { BLOCK_CATEGORIES, BLOCK_DEFINITIONS } from "./blocks";
import { useFlowApi } from "./flow/flow-api-context";
import { NodeConfigPopover } from "./node-config/node-config-popover";
import { BlockTitle, customNodeName } from "./node-title";
import type { WorkbenchNode } from "./types";

export function GroupNodeComponent({
  id,
  data,
  selected,
  positionAbsoluteX,
  positionAbsoluteY,
}: NodeProps<WorkbenchNode>) {
  const { addBlock, deleteNode } = useFlowApi();
  const { screenToFlowPosition } = useReactFlow();
  const [configOpen, setConfigOpen] = useState(false);
  const [contextPosition, setContextPosition] = useState<XYPosition | null>(
    null,
  );
  const definition = BLOCK_DEFINITIONS.group;
  const customName = customNodeName(data.name);
  const fallbackTitle = definition?.label ?? m.node_config_block_fallback();

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="block h-full"
        onContextMenu={(event) => {
          event.stopPropagation();
          const flowPosition = screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          });
          setContextPosition({
            x: flowPosition.x - positionAbsoluteX,
            y: flowPosition.y - positionAbsoluteY,
          });
        }}
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
        <ContextMenuGroup>
          <ContextMenuGroupLabel>
            {m.flow_group_add_block()}
          </ContextMenuGroupLabel>
          {BLOCK_CATEGORIES.map((category) => {
            const CategoryIcon = category.icon;
            const kinds = category.kinds.filter((kind) => kind !== "group");
            if (kinds.length === 0) {
              return null;
            }
            return (
              <ContextMenuSub key={category.id}>
                <ContextMenuSubTrigger>
                  <CategoryIcon />
                  {category.label}
                </ContextMenuSubTrigger>
                <ContextMenuSubPopup>
                  {kinds.map((kind) => {
                    const blockDefinition = BLOCK_DEFINITIONS[kind];
                    const Icon = blockDefinition.icon;
                    return (
                      <ContextMenuItem
                        key={kind}
                        onClick={() =>
                          addBlock(
                            kind,
                            contextPosition ?? { x: 16, y: 44 },
                            id,
                          )
                        }
                      >
                        <Icon />
                        {blockDefinition.label}
                      </ContextMenuItem>
                    );
                  })}
                </ContextMenuSubPopup>
              </ContextMenuSub>
            );
          })}
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => deleteNode(id)}>
          <Trash2Icon />
          {m.block_node_delete_block()}
        </ContextMenuItem>
      </ContextMenuPopup>
    </ContextMenu>
  );
}
