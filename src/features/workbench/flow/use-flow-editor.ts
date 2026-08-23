import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  EdgeChange,
  IsValidConnection,
  NodeChange,
  OnConnect,
  OnEdgesChange,
  OnNodesChange,
  Viewport,
  XYPosition,
} from "@xyflow/react";
import { useEdgesState, useNodesState } from "@xyflow/react";
import { useQueryClient } from "@tanstack/react-query";
import useLatest from "react-use/lib/useLatest";

import { scriptQueryFn, scriptQueryKey } from "@/hooks/query/use-script";
import { useSaveScriptDraft } from "@/hooks/query/use-scripts";
import {
  FLOW_NODE_PORTS,
  flowDataInputPorts,
  flowDataOutputPorts,
  flowInputPortIds,
  type FlowNodeKind,
  type ScriptDto,
  type FlowDocument,
  type FlowScriptSignature,
  type JsonValue,
} from "@/shared/project-contracts";

import { BLOCK_DEFINITIONS } from "../blocks";
import type { FlowBlockKind, WorkbenchEdge, WorkbenchNode } from "../types";
import {
  applyNodesChange,
  canConnectPorts,
  collectRemovedNodeIds,
  copySelection,
  defaultViewport,
  DEFAULT_GROUP_HEIGHT,
  DEFAULT_GROUP_WIDTH,
  edgesFromDocument,
  groupSelectedNodes,
  mergeEdge,
  nodesFromDocument,
  pasteSelection,
  patchNodeData,
  toFlowDocument,
  ungroupNodes,
  viewportFromDocument,
  type ClipboardPayload,
  type NodeGeometry,
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
  isValidConnection: IsValidConnection<WorkbenchEdge>;
  onViewportChange: (viewport: Viewport) => void;
  onMoveEnd: () => void;
  addBlock: (kind: FlowBlockKind, position?: XYPosition) => string;
  deleteNode: (id: string) => void;
  updateNodeData: (id: string, patch: Record<string, JsonValue>) => void;
  groupSelection: (geometry: ReadonlyMap<string, NodeGeometry>) => void;
  ungroupSelection: (geometry: ReadonlyMap<string, NodeGeometry>) => void;
  copySelected: () => void;
  cutSelected: () => void;
  pasteClipboard: (position?: XYPosition) => void;
  clipboard: ClipboardPayload | null;
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

export interface FlowEditorOptions {
  /**
   * Resolves signatures of callable scripts so Call-node ports participate
   * in connection validation while wiring.
   */
  resolveCallSignature?: (scriptId: string) => FlowScriptSignature | null;
}

export function useFlowEditor(
  script: ScriptDto | null,
  applyScriptUpdate: (script: ScriptDto) => void,
  options: FlowEditorOptions = {},
): FlowEditor {
  const [nodes, setNodes, rawOnNodesChange] =
    useNodesState<WorkbenchNode>([]);
  const [edges, setEdges, rawOnEdgesChange] =
    useEdgesState<WorkbenchEdge>([]);
  const [viewport, setViewport] = useState<Viewport>(defaultViewport());
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState<FlowSaveError>(null);
  const [clipboard, setClipboard] = useState<ClipboardPayload | null>(null);

  const queryClient = useQueryClient();
  const saveDraftMutation = useSaveScriptDraft();

  const nodesRef = useLatest(nodes);
  const edgesRef = useLatest(edges);
  const viewportRef = useLatest(viewport);
  const suppressViewportDirtyRef = useRef(false);

  const resolveCallSignature = options.resolveCallSignature;
  const portContext = useMemo(
    () => ({ resolveCallSignature }),
    [resolveCallSignature],
  );

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
      setEdges((current) => {
        const next = mergeEdge(current, connection, nodesRef.current, portContext);
        if (next !== current) {
          setDirty(true);
        }
        return next;
      });
    },
    [setEdges, nodesRef, portContext],
  );

  const isValidConnection = useCallback<IsValidConnection<WorkbenchEdge>>(
    (connection) => canConnectPorts(nodesRef.current, connection, portContext),
    [nodesRef, portContext],
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
    (kind: FlowBlockKind, position?: XYPosition): string => {
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
        ...(kind === "group"
          ? { width: DEFAULT_GROUP_WIDTH, height: DEFAULT_GROUP_HEIGHT }
          : {}),
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
      const removedIds = collectRemovedNodeIds(nodesRef.current, [id]);
      setNodes((current) =>
        applyNodesChange(
          [...removedIds].map((nodeId) => ({ type: "remove", id: nodeId })),
          current,
        ),
      );
      setEdges((current) =>
        current.filter(
          (edge) =>
            !removedIds.has(edge.source) && !removedIds.has(edge.target),
        ),
      );
      setDirty(true);
    },
    [setNodes, setEdges, nodesRef],
  );

  const updateNodeData = useCallback(
    (id: string, patch: Record<string, JsonValue>) => {
      setNodes((current) => {
        const next = current.map((node) =>
          node.id === id ? patchNodeData(node, patch) : node,
        );
        const patched = next.find((node) => node.id === id);
        if (patched !== undefined) {
          const kind = patched.type as FlowNodeKind;
          const flowInputs = flowInputPortIds(kind, patched.data);
          const dataInputs = flowDataInputPorts(
            kind,
            patched.data,
            portContext,
          );
          const dataOutputs = flowDataOutputPorts(
            kind,
            patched.data,
            portContext,
          );
          const flowOutputs = FLOW_NODE_PORTS[kind].outputs;
          const validInputs = new Set([
            ...flowInputs,
            ...dataInputs.map((port) => port.id),
          ]);
          const validOutputs = new Set([
            ...flowOutputs,
            ...dataOutputs.map((port) => port.id),
          ]);
          const defaultInput = flowInputs.length === 1 ? flowInputs[0] : "in";
          const defaultOutput =
            flowOutputs.length === 1 ? flowOutputs[0] : "next";
          setEdges((edges) =>
            edges.filter((edge) => {
              if (edge.source === id) {
                const handle = edge.sourceHandle ?? defaultOutput;
                if (!validOutputs.has(handle)) {
                  return false;
                }
              }
              if (edge.target === id) {
                const handle = edge.targetHandle ?? defaultInput;
                if (!validInputs.has(handle)) {
                  return false;
                }
              }
              return true;
            }),
          );
        }
        return next;
      });
      setDirty(true);
    },
    [setNodes, setEdges, portContext],
  );

  const groupSelection = useCallback(
    (geometry: ReadonlyMap<string, NodeGeometry>) => {
      const selectedIds = nodesRef.current
        .filter((node) => node.selected)
        .map((node) => node.id);
      if (selectedIds.length === 0) {
        return;
      }
      setNodes((current) =>
        groupSelectedNodes(current, geometry, selectedIds),
      );
      setDirty(true);
    },
    [setNodes, nodesRef],
  );

  const ungroupSelection = useCallback(
    (geometry: ReadonlyMap<string, NodeGeometry>) => {
      const groupIds = nodesRef.current
        .filter((node) => node.selected && node.type === "group")
        .map((node) => node.id);
      if (groupIds.length === 0) {
        return;
      }
      setNodes((current) => ungroupNodes(current, geometry, groupIds));
      setDirty(true);
    },
    [setNodes, nodesRef],
  );

  const copySelected = useCallback(() => {
    const payload = copySelection(nodesRef.current, edgesRef.current);
    if (payload !== null) {
      setClipboard(payload);
    }
  }, [nodesRef, edgesRef]);

  const cutSelected = useCallback(() => {
    const payload = copySelection(nodesRef.current, edgesRef.current);
    if (payload === null) {
      return;
    }
    setClipboard(payload);
    const ids = new Set(payload.nodes.map((node) => node.id));
    setNodes((current) =>
      applyNodesChange(
        [...ids].map((id) => ({ type: "remove", id })),
        current,
      ),
    );
    setEdges((current) =>
      current.filter((edge) => !ids.has(edge.source) && !ids.has(edge.target)),
    );
    setDirty(true);
  }, [nodesRef, edgesRef, setNodes, setEdges]);

  const pasteClipboard = useCallback(
    (position?: XYPosition) => {
      if (clipboard === null) {
        return;
      }
      const pasted = pasteSelection(
        clipboard,
        position !== undefined ? { origin: position } : undefined,
      );
      setNodes((current) => [
        ...current.map((node) =>
          node.selected ? { ...node, selected: false } : node,
        ),
        ...pasted.nodes,
      ]);
      setEdges((current) => [...current, ...pasted.edges]);
      setClipboard((current) =>
        current === null
          ? null
          : {
              nodes: current.nodes.map((node, index) => ({
                ...node,
                position: pasted.nodes[index].position,
              })),
              edges: current.edges,
            },
      );
      setDirty(true);
    },
    [clipboard, setNodes, setEdges],
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
      const result = await saveDraftMutation.mutateAsync({
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
  }, [script, applyScriptUpdate, saveDraftMutation]);

  const reloadLatest = useCallback(async (): Promise<boolean> => {
    if (script === null) {
      return false;
    }
    try {
      const fresh = await queryClient.fetchQuery({
        queryKey: scriptQueryKey(script.id),
        queryFn: scriptQueryFn(script.id),
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
  }, [script, applyScriptUpdate, loadDocument, queryClient]);

  const forceSave = useCallback(async (): Promise<boolean> => {
    if (script === null) {
      return false;
    }
    setSaveState("saving");
    setError(null);
    try {
      const fresh = await queryClient.fetchQuery({
        queryKey: scriptQueryKey(script.id),
        queryFn: scriptQueryFn(script.id),
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
      const result = await saveDraftMutation.mutateAsync({
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
  }, [script, applyScriptUpdate, saveDraftMutation, queryClient]);

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
    isValidConnection,
    onViewportChange,
    onMoveEnd,
    addBlock,
    deleteNode,
    updateNodeData,
    groupSelection,
    ungroupSelection,
    copySelected,
    cutSelected,
    pasteClipboard,
    clipboard,
    loadDocument,
    save,
    reloadLatest,
    forceSave,
    clearError,
  };
}
