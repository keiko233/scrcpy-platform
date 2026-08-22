import type {
  IsValidConnection,
  NodeChange,
  OnConnect,
  Viewport,
  XYPosition,
} from "@xyflow/react";
import { applyNodeChanges } from "@xyflow/react";

import {
  areFlowDataTypesCompatible,
  resolveFlowPort,
  type FlowDocument,
  type FlowEdge,
  type FlowViewport,
  type JsonValue,
} from "../../../shared/project-contracts";

import type {
  FlowBlockKind,
  WorkbenchEdge,
  WorkbenchNode,
  WorkbenchNodeData,
} from "../types";
import { BLOCK_DEFINITIONS, isFlowBlockKind } from "../blocks";

export function toFlowDocument(
  nodes: WorkbenchNode[],
  edges: WorkbenchEdge[],
  viewport: FlowViewport,
): FlowDocument {
  return {
    schemaVersion: 1,
    nodes: nodes.map((node) => ({
      id: node.id,
      position: node.position,
      data: node.data,
      type: node.type,
    })),
    edges: edges.map((edge) => {
      const serialized: FlowEdge = {
        id: edge.id,
        source: edge.source,
        target: edge.target,
      };
      if (edge.sourceHandle !== undefined && edge.sourceHandle !== null) {
        serialized.sourceHandle = edge.sourceHandle;
      }
      if (edge.targetHandle !== undefined && edge.targetHandle !== null) {
        serialized.targetHandle = edge.targetHandle;
      }
      if (edge.type !== undefined) {
        serialized.type = edge.type;
      }
      return serialized;
    }),
    viewport,
  };
}

export function nodesFromDocument(document: FlowDocument): WorkbenchNode[] {
  return document.nodes.map((node) => {
    const rawData: Record<string, JsonValue> =
      typeof node.data === "object" &&
      node.data !== null &&
      !Array.isArray(node.data)
        ? (node.data as Record<string, JsonValue>)
        : {};
    const kind = isFlowBlockKind(node.type)
      ? node.type
      : isFlowBlockKind(rawData.kind)
        ? rawData.kind
        : "delay";
    const rawPosition: Record<string, unknown> =
      typeof node.position === "object" &&
      node.position !== null &&
      !Array.isArray(node.position)
        ? (node.position as Record<string, unknown>)
        : {};
    const position: XYPosition = {
      x: typeof rawPosition.x === "number" ? rawPosition.x : 0,
      y: typeof rawPosition.y === "number" ? rawPosition.y : 0,
    };

    return {
      id: node.id,
      position,
      data: {
        ...BLOCK_DEFINITIONS[kind].defaults,
        ...rawData,
        kind,
      },
      type: kind,
    };
  });
}

export function edgesFromDocument(document: FlowDocument): WorkbenchEdge[] {
  return document.edges.map((edge) => {
    const next: WorkbenchEdge = {
      id: edge.id,
      source: edge.source as string,
      target: edge.target as string,
    };
    next.sourceHandle =
      typeof edge.sourceHandle === "string" ? edge.sourceHandle : "next";
    next.targetHandle =
      typeof edge.targetHandle === "string" ? edge.targetHandle : "in";
    if (typeof edge.type === "string") {
      next.type = edge.type;
    }
    return next;
  });
}

export function viewportFromDocument(
  document: FlowDocument,
  fallback?: Viewport,
): Viewport {
  const viewport = document.viewport ?? fallback;
  return {
    x: viewport?.x ?? 0,
    y: viewport?.y ?? 0,
    zoom: viewport?.zoom ?? 1,
  };
}

export function defaultViewport(): Viewport {
  return { x: 0, y: 0, zoom: 1 };
}

export function applyNodesChange(
  changes: NodeChange<WorkbenchNode>[],
  nodes: WorkbenchNode[],
): WorkbenchNode[] {
  return applyNodeChanges(changes, nodes);
}

export function patchNodeData(
  node: WorkbenchNode,
  patch: Record<string, JsonValue>,
): WorkbenchNode {
  return { ...node, data: { ...node.data, ...patch } as WorkbenchNode["data"] };
}

export function mergeEdge(
  edges: WorkbenchEdge[],
  connection: Parameters<OnConnect>[0],
  nodes: WorkbenchNode[],
): WorkbenchEdge[] {
  const ports = connectionPorts(nodes, connection);
  if (ports === null) {
    return edges;
  }
  const sourceHandle = connection.sourceHandle ?? null;
  const targetHandle = connection.targetHandle ?? null;
  const isExactDuplicate = (edge: WorkbenchEdge) =>
    edge.source === connection.source &&
    edge.target === connection.target &&
    (edge.sourceHandle ?? null) === sourceHandle &&
    (edge.targetHandle ?? null) === targetHandle;
  if (edges.some(isExactDuplicate)) {
    return edges;
  }
  const next: WorkbenchEdge = {
    ...connection,
    id: `edge-${crypto.randomUUID()}`,
  };
  return [
    ...edges.filter(
      (edge) =>
        !(
          (edge.target === next.target &&
            (edge.targetHandle ?? null) === targetHandle) ||
          (ports.source.role === "flow" &&
            edge.source === next.source &&
            (edge.sourceHandle ?? null) === sourceHandle)
        ),
    ),
    next,
  ];
}

function connectionPorts(
  nodes: WorkbenchNode[],
  connection: Parameters<IsValidConnection<WorkbenchEdge>>[0],
) {
  if (connection.source === null || connection.target === null) {
    return null;
  }
  const source = nodes.find((node) => node.id === connection.source);
  const target = nodes.find((node) => node.id === connection.target);
  if (source === undefined || target === undefined) {
    return null;
  }
  const sourcePort = resolveFlowPort(
    source.data.kind,
    "output",
    connection.sourceHandle ?? undefined,
    source.data,
  );
  const targetPort = resolveFlowPort(
    target.data.kind,
    "input",
    connection.targetHandle ?? undefined,
    target.data,
  );
  if (
    sourcePort === null ||
    targetPort === null ||
    sourcePort.role !== targetPort.role
  ) {
    return null;
  }
  if (
    sourcePort.role === "data" &&
    targetPort.role === "data" &&
    !areFlowDataTypesCompatible(sourcePort.dataType, targetPort.dataType)
  ) {
    return null;
  }
  return { source: sourcePort, target: targetPort };
}

export function canConnectPorts(
  nodes: WorkbenchNode[],
  connection: Parameters<IsValidConnection<WorkbenchEdge>>[0],
): boolean {
  return connectionPorts(nodes, connection) !== null;
}

export interface ClipboardNode {
  id: string;
  type: FlowBlockKind;
  position: XYPosition;
  data: WorkbenchNodeData;
}

export interface ClipboardEdge {
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface ClipboardPayload {
  nodes: ClipboardNode[];
  edges: ClipboardEdge[];
}

export interface PasteOptions {
  offset?: XYPosition;
  origin?: XYPosition;
}

export function copySelection(
  nodes: WorkbenchNode[],
  edges: WorkbenchEdge[],
): ClipboardPayload | null {
  const selected = nodes.filter(
    (node) =>
      node.selected === true &&
      node.type !== "start" &&
      node.type !== "end",
  );
  if (selected.length === 0) {
    return null;
  }
  const ids = new Set(selected.map((node) => node.id));
  return {
    nodes: selected.map((node) => ({
      id: node.id,
      type: node.type,
      position: { x: node.position.x, y: node.position.y },
      data: node.data,
    })),
    edges: edges
      .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
      .map((edge) => {
        const next: ClipboardEdge = {
          source: edge.source,
          target: edge.target,
        };
        if (edge.sourceHandle !== undefined && edge.sourceHandle !== null) {
          next.sourceHandle = edge.sourceHandle;
        }
        if (edge.targetHandle !== undefined && edge.targetHandle !== null) {
          next.targetHandle = edge.targetHandle;
        }
        return next;
      }),
  };
}

export function pasteSelection(
  payload: ClipboardPayload,
  options?: PasteOptions,
): { nodes: WorkbenchNode[]; edges: WorkbenchEdge[] } {
  if (payload.nodes.length === 0) {
    return { nodes: [], edges: [] };
  }
  const minX = Math.min(...payload.nodes.map((node) => node.position.x));
  const minY = Math.min(...payload.nodes.map((node) => node.position.y));
  const offset =
    options?.origin !== undefined
      ? { x: options.origin.x - minX, y: options.origin.y - minY }
      : (options?.offset ?? { x: 40, y: 40 });
  const idMap = new Map<string, string>();
  const nodes: WorkbenchNode[] = payload.nodes.map((node) => {
    const id = `node-${crypto.randomUUID()}`;
    idMap.set(node.id, id);
    return {
      id,
      type: node.type,
      position: {
        x: node.position.x + offset.x,
        y: node.position.y + offset.y,
      },
      data: node.data,
      selected: true,
    };
  });
  const edges: WorkbenchEdge[] = payload.edges
    .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
    .map((edge) => {
      const next: WorkbenchEdge = {
        id: `edge-${crypto.randomUUID()}`,
        source: idMap.get(edge.source) as string,
        target: idMap.get(edge.target) as string,
      };
      if (edge.sourceHandle !== undefined) {
        next.sourceHandle = edge.sourceHandle;
      }
      if (edge.targetHandle !== undefined) {
        next.targetHandle = edge.targetHandle;
      }
      return next;
    });
  return { nodes, edges };
}
