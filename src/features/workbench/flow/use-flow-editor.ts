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
  parseClipboardPayload,
  readStoredClipboardPayload,
  serializeClipboardPayload,
  storeClipboardPayload,
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
  getDocument: () => FlowDocument;
  addBlock: (kind: FlowBlockKind, position?: XYPosition) => string;
  deleteNode: (id: string) => void;
  updateNodeData: (id: string, patch: Record<string, JsonValue>) => void;
  groupSelection: (geometry: ReadonlyMap<string, NodeGeometry>) => void;
  ungroupSelection: (geometry: ReadonlyMap<string, NodeGeometry>) => void;
  copySelected: () => void;
  cutSelected: () => void;
  pasteClipboard: (position?: XYPosition) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  clipboard: ClipboardPayload | null;
  loadDocument: (document: FlowDocument) => void;
  save: () => Promise<boolean>;
  reloadLatest: () => Promise<boolean>;
  forceSave: () => Promise<boolean>;
  clearError: () => void;
}

interface FlowHistorySnapshot {
  nodes: WorkbenchNode[];
  edges: WorkbenchEdge[];
  viewport: Viewport;
}

interface FlowHistoryState {
  past: FlowHistorySnapshot[];
  future: FlowHistorySnapshot[];
  dragging: boolean;
}

function flowDocumentSignature(document: FlowDocument): string {
  return JSON.stringify(document);
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
  const [clipboard, setClipboard] = useState<ClipboardPayload | null>(
    readStoredClipboardPayload,
  );

  const queryClient = useQueryClient();
  const saveDraftMutation = useSaveScriptDraft();

  const nodesRef = useLatest(nodes);
  const edgesRef = useLatest(edges);
  const viewportRef = useLatest(viewport);
  const historyRef = useRef<FlowHistoryState>({
    past: [],
    future: [],
    dragging: false,
  });
  const savedDocumentSignatureRef = useRef<string | null>(null);

  const resolveCallSignature = options.resolveCallSignature;
  const portContext = useMemo(
    () => ({ resolveCallSignature }),
    [resolveCallSignature],
  );

  const getHistorySnapshot = useCallback<() => FlowHistorySnapshot>(
    () => ({
      nodes: nodesRef.current,
      edges: edgesRef.current,
      viewport: viewportRef.current,
    }),
    [nodesRef, edgesRef, viewportRef],
  );

  const recordHistory = useCallback(() => {
    historyRef.current.past.push(getHistorySnapshot());
    historyRef.current.future = [];
  }, [getHistorySnapshot]);

  const clearHistory = useCallback(() => {
    historyRef.current = { past: [], future: [], dragging: false };
  }, []);

  const loadDocument = useCallback(
    (document: FlowDocument) => {
      clearHistory();
      const nextNodes = nodesFromDocument(document);
      const nextEdges = edgesFromDocument(document);
      const nextViewport = viewportFromDocument(document);
      savedDocumentSignatureRef.current = flowDocumentSignature(
        toFlowDocument(nextNodes, nextEdges, nextViewport),
      );
      setNodes(nextNodes);
      setEdges(nextEdges);
      setViewport(nextViewport);
      setDirty(false);
      setError(null);
    },
    [clearHistory, setNodes, setEdges],
  );

  useEffect(() => {
    if (script === null) {
      clearHistory();
      savedDocumentSignatureRef.current = null;
      setNodes([]);
      setEdges([]);
      setViewport(defaultViewport());
      setDirty(false);
      setError(null);
      return;
    }
    loadDocument(script.draftDocument);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearHistory, script?.id]);

  const onNodesChange = useCallback<OnNodesChange<WorkbenchNode>>(
    (changes) => {
      if (changes.some(isStructuralChange)) {
        const positionChanges = changes.filter(
          (change) => change.type === "position",
        );
        if (positionChanges.length > 0) {
          const isDragging = positionChanges.some(
            (change) => change.dragging === true,
          );
          if (isDragging) {
            if (!historyRef.current.dragging) {
              recordHistory();
            }
            historyRef.current.dragging = true;
          } else {
            if (!historyRef.current.dragging) {
              recordHistory();
            }
            historyRef.current.dragging = false;
          }
        } else {
          recordHistory();
          historyRef.current.dragging = false;
        }
      }
      rawOnNodesChange(changes);
      if (changes.some(isStructuralChange)) {
        setDirty(true);
      }
    },
    [rawOnNodesChange, recordHistory],
  );

  const onEdgesChange = useCallback<OnEdgesChange<WorkbenchEdge>>(
    (changes) => {
      if (changes.some(isStructuralChange)) {
        recordHistory();
        historyRef.current.dragging = false;
      }
      rawOnEdgesChange(changes);
      if (changes.some(isStructuralChange)) {
        setDirty(true);
      }
    },
    [rawOnEdgesChange, recordHistory],
  );

  const onConnect = useCallback<OnConnect>(
    (connection) => {
      const next = mergeEdge(
        edgesRef.current,
        connection,
        nodesRef.current,
        portContext,
      );
      if (next === edgesRef.current) {
        return;
      }
      recordHistory();
      setEdges(next);
      setDirty(true);
    },
    [edgesRef, nodesRef, portContext, recordHistory, setEdges],
  );

  const isValidConnection = useCallback<IsValidConnection<WorkbenchEdge>>(
    (connection) => canConnectPorts(nodesRef.current, connection, portContext),
    [nodesRef, portContext],
  );

  const onViewportChange = useCallback((nextViewport: Viewport) => {
    setViewport(nextViewport);
  }, []);

  const getDocument = useCallback(
    () => toFlowDocument(nodesRef.current, edgesRef.current, viewportRef.current),
    [nodesRef, edgesRef, viewportRef],
  );

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
      recordHistory();
      setNodes((current) => [
        ...current.map((item) =>
          item.selected ? { ...item, selected: false } : item,
        ),
        node,
      ]);
      setDirty(true);
      return id;
    },
    [nodesRef, recordHistory, setNodes],
  );

  const deleteNode = useCallback(
    (id: string) => {
      const removedIds = collectRemovedNodeIds(nodesRef.current, [id]);
      if (removedIds.size === 0) {
        return;
      }
      recordHistory();
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
    [nodesRef, recordHistory, setNodes, setEdges],
  );

  const updateNodeData = useCallback(
    (id: string, patch: Record<string, JsonValue>) => {
      if (!nodesRef.current.some((node) => node.id === id)) {
        return;
      }
      recordHistory();
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
    [nodesRef, recordHistory, setNodes, setEdges, portContext],
  );

  const groupSelection = useCallback(
    (geometry: ReadonlyMap<string, NodeGeometry>) => {
      const selectedIds = nodesRef.current
        .filter((node) => node.selected)
        .map((node) => node.id);
      if (selectedIds.length === 0) {
        return;
      }
      recordHistory();
      setNodes((current) =>
        groupSelectedNodes(current, geometry, selectedIds),
      );
      setDirty(true);
    },
    [nodesRef, recordHistory, setNodes],
  );

  const ungroupSelection = useCallback(
    (geometry: ReadonlyMap<string, NodeGeometry>) => {
      const groupIds = nodesRef.current
        .filter((node) => node.selected && node.type === "group")
        .map((node) => node.id);
      if (groupIds.length === 0) {
        return;
      }
      recordHistory();
      setNodes((current) => ungroupNodes(current, geometry, groupIds));
      setDirty(true);
    },
    [nodesRef, recordHistory, setNodes],
  );

  const rememberClipboard = useCallback((payload: ClipboardPayload) => {
    setClipboard(payload);
    storeClipboardPayload(payload);
    if (typeof navigator !== "undefined" && navigator.clipboard !== undefined) {
      void navigator.clipboard
        .writeText(serializeClipboardPayload(payload))
        .catch(() => {
          // The in-app session clipboard is the fallback when browser clipboard
          // permissions are unavailable in the packaged Electron renderer.
        });
    }
  }, []);

  const copySelected = useCallback(() => {
    const payload = copySelection(nodesRef.current, edgesRef.current);
    if (payload !== null) {
      rememberClipboard(payload);
    }
  }, [nodesRef, edgesRef, rememberClipboard]);

  const cutSelected = useCallback(() => {
    const payload = copySelection(nodesRef.current, edgesRef.current);
    if (payload === null) {
      return;
    }
    rememberClipboard(payload);
    recordHistory();
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
  }, [nodesRef, edgesRef, recordHistory, rememberClipboard, setNodes, setEdges]);

  const pasteClipboard = useCallback(
    (position?: XYPosition) => {
      const paste = (payload: ClipboardPayload) => {
        recordHistory();
        const pasted = pasteSelection(
          payload,
          position !== undefined ? { origin: position } : undefined,
        );
        setNodes((current) => [
          ...current.map((node) =>
            node.selected ? { ...node, selected: false } : node,
          ),
          ...pasted.nodes,
        ]);
        setEdges((current) => [...current, ...pasted.edges]);
        rememberClipboard({
          nodes: payload.nodes.map((node, index) => ({
            ...node,
            position: pasted.nodes[index]?.position ?? node.position,
          })),
          edges: payload.edges,
        });
        setDirty(true);
      };

      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard !== undefined
      ) {
        void navigator.clipboard
          .readText()
          .then((text) => parseClipboardPayload(text) ?? clipboard)
          .catch(() => clipboard)
          .then((payload) => {
            if (payload !== null) {
              paste(payload);
            }
          });
        return;
      }
      if (clipboard !== null) {
        paste(clipboard);
      }
    },
    [clipboard, recordHistory, rememberClipboard, setNodes, setEdges],
  );

  const restoreHistorySnapshot = useCallback(
    (snapshot: FlowHistorySnapshot) => {
      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
      setViewport(snapshot.viewport);
      setDirty(
        savedDocumentSignatureRef.current !==
          flowDocumentSignature(
            toFlowDocument(snapshot.nodes, snapshot.edges, snapshot.viewport),
          ),
      );
      setError(null);
      historyRef.current.dragging = false;
    },
    [setNodes, setEdges],
  );

  const undo = useCallback(() => {
    const snapshot = historyRef.current.past.pop();
    if (snapshot === undefined) {
      return;
    }
    historyRef.current.future.push(getHistorySnapshot());
    restoreHistorySnapshot(snapshot);
  }, [getHistorySnapshot, restoreHistorySnapshot]);

  const redo = useCallback(() => {
    const snapshot = historyRef.current.future.pop();
    if (snapshot === undefined) {
      return;
    }
    historyRef.current.past.push(getHistorySnapshot());
    restoreHistorySnapshot(snapshot);
  }, [getHistorySnapshot, restoreHistorySnapshot]);

  const save = useCallback(async (): Promise<boolean> => {
    if (script === null) {
      return false;
    }
    setSaveState("saving");
    setError(null);
    const document = getDocument();
    try {
      const result = await saveDraftMutation.mutateAsync({
        scriptId: script.id,
        expectedDraftVersion: script.draftVersion,
        document,
      });
      if (result.status === "ok") {
        applyScriptUpdate(result.script);
        savedDocumentSignatureRef.current = flowDocumentSignature(document);
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
  }, [script, applyScriptUpdate, getDocument, saveDraftMutation]);

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
      const document = getDocument();
      const result = await saveDraftMutation.mutateAsync({
        scriptId: script.id,
        expectedDraftVersion: fresh.draftVersion,
        document,
      });
      if (result.status === "ok") {
        applyScriptUpdate(result.script);
        savedDocumentSignatureRef.current = flowDocumentSignature(document);
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
  }, [script, applyScriptUpdate, getDocument, saveDraftMutation, queryClient]);

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
    getDocument,
    addBlock,
    deleteNode,
    updateNodeData,
    groupSelection,
    ungroupSelection,
    copySelected,
    cutSelected,
    pasteClipboard,
    undo,
    redo,
    canUndo: historyRef.current.past.length > 0,
    canRedo: historyRef.current.future.length > 0,
    clipboard,
    loadDocument,
    save,
    reloadLatest,
    forceSave,
    clearError,
  };
}
