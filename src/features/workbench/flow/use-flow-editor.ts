import { useCallback, useEffect, useRef, useState } from "react";
import type {
  EdgeChange,
  NodeChange,
  OnConnect,
  OnEdgesChange,
  OnNodesChange,
  Viewport,
  XYPosition,
} from "@xyflow/react";
import { useEdgesState, useNodesState } from "@xyflow/react";
import useLatest from "react-use/lib/useLatest";

import type {
  ScriptDto,
  FlowDocument,
  JsonValue,
} from "@/shared/project-contracts";

import { BLOCK_DEFINITIONS } from "../blocks";
import type { AutomationBlockKind, WorkbenchEdge, WorkbenchNode } from "../types";
import {
  applyNodesChange,
  defaultViewport,
  edgesFromDocument,
  mergeEdge,
  nodesFromDocument,
  patchNodeData,
  toFlowDocument,
  viewportFromDocument,
} from "./flow-document";

export type FlowSaveError =
  | "stale-draft"
  | "script-not-found"
  | "save-failed"
  | null;

export interface FlowEditor {
  nodes: WorkbenchNode[];
  edges: WorkbenchEdge[];
  viewport: Viewport;
  dirty: boolean;
  saveState: "idle" | "saving";
  error: FlowSaveError;
  selectedNodes: WorkbenchNode[];
  selectedNode: WorkbenchNode | null;
  onNodesChange: OnNodesChange<WorkbenchNode>;
  onEdgesChange: OnEdgesChange<WorkbenchEdge>;
  onConnect: OnConnect;
  onViewportChange: (viewport: Viewport) => void;
  onMoveEnd: () => void;
  addBlock: (kind: AutomationBlockKind, position?: XYPosition) => string;
  deleteNode: (id: string) => void;
  updateNodeData: (id: string, patch: Record<string, JsonValue>) => void;
  loadDocument: (document: FlowDocument) => void;
  save: () => Promise<boolean>;
  reloadLatest: () => Promise<boolean>;
  forceSave: () => Promise<boolean>;
  clearError: () => void;
}

function isStructuralChange(
  change: NodeChange<WorkbenchNode> | EdgeChange<WorkbenchEdge>,
): boolean {
  return change.type !== "select";
}

export function useFlowEditor(
  script: ScriptDto | null,
  applyScriptUpdate: (script: ScriptDto) => void,
): FlowEditor {
  const [nodes, setNodes, rawOnNodesChange] =
    useNodesState<WorkbenchNode>([]);
  const [edges, setEdges, rawOnEdgesChange] =
    useEdgesState<WorkbenchEdge>([]);
  const [viewport, setViewport] = useState<Viewport>(defaultViewport());
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState<FlowSaveError>(null);

  const nodesRef = useLatest(nodes);
  const edgesRef = useLatest(edges);
  const viewportRef = useLatest(viewport);
  const suppressViewportDirtyRef = useRef(false);

  const loadDocument = useCallback((document: FlowDocument) => {
    suppressViewportDirtyRef.current = true;
    window.setTimeout(() => {
      suppressViewportDirtyRef.current = false;
    }, 0);
    setNodes(nodesFromDocument(document));
    setEdges(edgesFromDocument(document));
    setViewport(viewportFromDocument(document));
    setDirty(false);
    setError(null);
  }, [setNodes, setEdges]);

  useEffect(() => {
    if (script === null) {
      setNodes([]);
      setEdges([]);
      setViewport(defaultViewport());
      setDirty(false);
      setError(null);
      return;
    }
    loadDocument(script.draftDocument);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script?.id]);

  const onNodesChange = useCallback<OnNodesChange<WorkbenchNode>>(
    (changes) => {
      rawOnNodesChange(changes);
      if (changes.some(isStructuralChange)) {
        setDirty(true);
      }
    },
    [rawOnNodesChange],
  );

  const onEdgesChange = useCallback<OnEdgesChange<WorkbenchEdge>>(
    (changes) => {
      rawOnEdgesChange(changes);
      if (changes.some(isStructuralChange)) {
        setDirty(true);
      }
    },
    [rawOnEdgesChange],
  );

  const onConnect = useCallback<OnConnect>(
    (connection) => {
      setEdges((current) => mergeEdge(current, connection));
      setDirty(true);
    },
    [setEdges],
  );

  const onViewportChange = useCallback((nextViewport: Viewport) => {
    setViewport(nextViewport);
  }, []);

  const onMoveEnd = useCallback(() => {
    if (suppressViewportDirtyRef.current) {
      return;
    }
    setDirty(true);
  }, []);

  const addBlock = useCallback(
    (kind: AutomationBlockKind, position?: XYPosition): string => {
      const definition = BLOCK_DEFINITIONS[kind];
      const id = `node-${crypto.randomUUID()}`;
      const last = nodesRef.current[nodesRef.current.length - 1];
      const fallback: XYPosition = last
        ? { x: last.position.x + 32, y: last.position.y + 32 }
        : { x: 0, y: 0 };
      const node: WorkbenchNode = {
        id,
        type: kind,
        position: position ?? fallback,
        data: { ...definition.defaults },
        selected: true,
      };
      setNodes((current) => [
        ...current.map((item) =>
          item.selected ? { ...item, selected: false } : item,
        ),
        node,
      ]);
      setDirty(true);
      return id;
    },
    [setNodes],
  );

  const deleteNode = useCallback(
    (id: string) => {
      setNodes((current) =>
        applyNodesChange([{ type: "remove", id }], current),
      );
      setEdges((current) =>
        current.filter((edge) => edge.source !== id && edge.target !== id),
      );
      setDirty(true);
    },
    [setNodes, setEdges],
  );

  const updateNodeData = useCallback(
    (id: string, patch: Record<string, JsonValue>) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === id ? patchNodeData(node, patch) : node,
        ),
      );
      setDirty(true);
    },
    [setNodes],
  );

  const save = useCallback(async (): Promise<boolean> => {
    if (script === null) {
      return false;
    }
    setSaveState("saving");
    setError(null);
    const document = toFlowDocument(
      nodesRef.current,
      edgesRef.current,
      viewportRef.current,
    );
    try {
      const result = await window.androidPlatform.saveScriptDraft({
        scriptId: script.id,
        expectedDraftVersion: script.draftVersion,
        document,
      });
      if (result.status === "ok") {
        applyScriptUpdate(result.script);
        setDirty(false);
        return true;
      }
      setError(result.error === "stale-draft" ? "stale-draft" : "script-not-found");
      return false;
    } catch (cause) {
      setError("save-failed");
      console.error("Failed to save draft", cause);
      return false;
    } finally {
      setSaveState("idle");
    }
  }, [script, applyScriptUpdate]);

  const reloadLatest = useCallback(async (): Promise<boolean> => {
    if (script === null) {
      return false;
    }
    try {
      const fresh = await window.androidPlatform.getScript({
        scriptId: script.id,
      });
      if (fresh === null) {
        setError("script-not-found");
        return false;
      }
      applyScriptUpdate(fresh);
      loadDocument(fresh.draftDocument);
      return true;
    } catch (cause) {
      console.error("Failed to reload script", cause);
      setError("save-failed");
      return false;
    }
  }, [script, applyScriptUpdate, loadDocument]);

  const forceSave = useCallback(async (): Promise<boolean> => {
    if (script === null) {
      return false;
    }
    setSaveState("saving");
    setError(null);
    try {
      const fresh = await window.androidPlatform.getScript({
        scriptId: script.id,
      });
      if (fresh === null) {
        setError("script-not-found");
        return false;
      }
      applyScriptUpdate(fresh);
      const document = toFlowDocument(
        nodesRef.current,
        edgesRef.current,
        viewportRef.current,
      );
      const result = await window.androidPlatform.saveScriptDraft({
        scriptId: script.id,
        expectedDraftVersion: fresh.draftVersion,
        document,
      });
      if (result.status === "ok") {
        applyScriptUpdate(result.script);
        setDirty(false);
        return true;
      }
      setError(result.error === "stale-draft" ? "stale-draft" : "script-not-found");
      return false;
    } catch (cause) {
      console.error("Failed to resolve save conflict", cause);
      setError("save-failed");
      return false;
    } finally {
      setSaveState("idle");
    }
  }, [script, applyScriptUpdate]);

  const selectedNodes = nodes.filter((node) => node.selected);
  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0] : null;
  const clearError = useCallback(() => setError(null), []);

  return {
    nodes,
    edges,
    viewport,
    dirty,
    saveState,
    error,
    selectedNodes,
    selectedNode,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onViewportChange,
    onMoveEnd,
    addBlock,
    deleteNode,
    updateNodeData,
    loadDocument,
    save,
    reloadLatest,
    forceSave,
    clearError,
  };
}
