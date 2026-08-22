import { useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type XYPosition,
} from "@xyflow/react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuGroup,
  ContextMenuGroupLabel,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  AlertTriangleIcon,
  GitForkIcon,
  Trash2Icon,
} from "lucide-react";

import { BLOCK_DEFINITIONS, FLOW_BLOCK_KIND_ORDER } from "../blocks";
import { AUTOMATION_NODE_TYPES } from "../node-types";
import type { FlowBlockKind } from "../types";
import { useWorkbench } from "../use-workbench";
import { m } from "@/paraglide/messages.js";

function EditorEmptyState() {
  return (
    <Empty className="gap-3 px-4 py-6">
      <EmptyMedia variant="icon">
        <GitForkIcon />
      </EmptyMedia>
      <EmptyTitle className="text-sm">{m.flow_editor_no_script_open()}</EmptyTitle>
      <EmptyDescription>{m.flow_editor_no_script_description()}</EmptyDescription>
    </Empty>
  );
}

function FlowCanvas() {
  const { flow } = useWorkbench();
  const { screenToFlowPosition } = useReactFlow();
  const [panePosition, setPanePosition] = useState<XYPosition | null>(null);

  const {
    nodes,
    edges,
    viewport,
    selectedNodes,
    onNodesChange,
    onEdgesChange,
    onConnect,
    isValidConnection,
    onViewportChange,
    onMoveEnd,
    addBlock,
    deleteNode,
    error,
    reloadLatest,
    forceSave,
    clearError,
  } = flow;

  const handlePaneContextMenu = (event: ReactMouseEvent) => {
    event.preventDefault();
    setPanePosition(screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  };

  const addBlockAtPane = (kind: FlowBlockKind) => {
    addBlock(kind, panePosition ?? undefined);
    setPanePosition(null);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {error !== null && (
        <div className="z-20 flex shrink-0 items-center gap-2 border-b bg-card p-2">
          <Alert
            variant={error === "stale-draft" ? "warning" : "error"}
            className="flex-1 gap-1.5 px-2.5 py-1.5 text-xs"
          >
            <AlertTriangleIcon />
            <AlertTitle className="text-xs">
              {error === "stale-draft"
                ? m.flow_editor_draft_changed()
                : error === "script-not-found"
                  ? m.flow_editor_script_not_found()
                  : m.flow_editor_draft_not_saved()}
            </AlertTitle>
            <AlertDescription className="text-[11px]">
              {error === "stale-draft"
                ? m.flow_editor_draft_changed_description()
                : error === "script-not-found"
                  ? m.flow_editor_script_not_found_description()
                  : m.flow_editor_draft_not_saved_description()}
            </AlertDescription>
          </Alert>
          {error === "stale-draft" ? (
            <>
              <Button size="sm" variant="outline" onClick={() => void reloadLatest()}>
                {m.flow_editor_load_latest()}
              </Button>
              <Button size="sm" variant="default" onClick={() => void forceSave()}>
                {m.flow_editor_overwrite()}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="default" onClick={clearError}>
              {m.flow_editor_dismiss()}
            </Button>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1">
        <ContextMenu>
          <ContextMenuTrigger className="block h-full" onContextMenu={handlePaneContextMenu}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={AUTOMATION_NODE_TYPES}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              viewport={viewport}
              onViewportChange={onViewportChange}
              onMoveEnd={onMoveEnd}
              onPaneContextMenu={(event) => event.preventDefault()}
              deleteKeyCode={["Backspace", "Delete"]}
              connectionRadius={20}
              minZoom={0.2}
              maxZoom={2}
            >
              <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
              <Controls position="bottom-left" showInteractive={false} />
            </ReactFlow>
          </ContextMenuTrigger>

          <ContextMenuPopup align="center" sideOffset={6}>
            <ContextMenuGroup>
              <ContextMenuGroupLabel>{m.flow_editor_add_block_at_pointer()}</ContextMenuGroupLabel>
              {FLOW_BLOCK_KIND_ORDER.map((kind) => {
                const definition = BLOCK_DEFINITIONS[kind];
                const Icon = definition.icon;
                return (
                  <ContextMenuItem key={kind} onClick={() => addBlockAtPane(kind)}>
                    <Icon />
                    {definition.label}
                  </ContextMenuItem>
                );
              })}
            </ContextMenuGroup>
            {selectedNodes.length > 0 && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem
                  variant="destructive"
                  onClick={() => {
                    selectedNodes.forEach((node) => deleteNode(node.id));
                  }}
                >
                  <Trash2Icon />
                  {m.flow_editor_delete_selected({ count: selectedNodes.length })}
                </ContextMenuItem>
              </>
            )}
          </ContextMenuPopup>
        </ContextMenu>
      </div>
    </div>
  );
}

export function FlowEditorPanel() {
  const { library, flow } = useWorkbench();
  const { selectedScript } = library;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-card">
      <div className="flex items-center min-h-0 overflow-hidden bg-muted/40 p-1 text-sm gap-1">
        <GitForkIcon className="size-3.5" />
        {m.flow_editor_flow_editor_title()}
        <span className="ms-auto flex min-w-0 items-center gap-2 truncate">
          {selectedScript ? (
            <>
              <span className="truncate">{selectedScript.name}</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                v{selectedScript.draftVersion}
              </span>
              {flow.dirty && (
                <span
                  className="inline-block size-1.5 shrink-0 rounded-full bg-warning"
                  aria-label={m.flow_editor_unsaved_changes_aria()}
                />
              )}
            </>
          ) : (
            <span className="text-muted-foreground">{m.flow_editor_no_script()}</span>
          )}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {selectedScript === null ? (
          <EditorEmptyState />
        ) : (
          <ReactFlowProvider>
            <FlowCanvas />
          </ReactFlowProvider>
        )}
      </div>
    </div>
  );
}
