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
import { BLOCK_DEFINITIONS, isAutomationBlockKind } from "../blocks";

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
    const rawData =
      typeof node.data === "object" &&
      node.data !== null &&
      !Array.isArray(node.data)
        ? node.data
        : {};
    const kind = isAutomationBlockKind(node.type)
      ? node.type
      : isAutomationBlockKind(rawData.kind)
        ? rawData.kind
        : "delay";
    const rawPosition =
      typeof node.position === "object" &&
      node.position !== null &&
      !Array.isArray(node.position)
        ? node.position
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
    if (typeof edge.sourceHandle === "string") {
      next.sourceHandle = edge.sourceHandle;
    }
    if (typeof edge.targetHandle === "string") {
      next.targetHandle = edge.targetHandle;
    }
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
  return { ...node, data: { ...node.data, ...patch } };
}

export function mergeEdge(
  edges: WorkbenchEdge[],
  connection: Parameters<OnConnect>[0],
): WorkbenchEdge[] {
  return [...edges, { ...connection, id: `edge-${crypto.randomUUID()}` }];
}
