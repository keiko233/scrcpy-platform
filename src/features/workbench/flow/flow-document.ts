import type {
  NodeChange,
  OnConnect,
  Viewport,
  XYPosition,
} from "@xyflow/react";
import { applyNodeChanges } from "@xyflow/react";

import type {
  FlowDocument,
  FlowEdge,
  FlowViewport,
  JsonValue,
} from "@/shared/project-contracts";

import type { WorkbenchEdge, WorkbenchNode } from "../types";
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
): WorkbenchEdge[] {
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
          (edge.source === next.source &&
            (edge.sourceHandle ?? null) === sourceHandle)
        ),
    ),
    next,
  ];
}
