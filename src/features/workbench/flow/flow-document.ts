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
  type FlowNode,
  type FlowPortContext,
  type FlowViewport,
  type JsonValue,
} from "../../../shared/project-contracts";
import { StorageKey } from "../../../shared/constants/enums";

import { UiConstants } from "../../../shared/constants/app";
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
    nodes: nodes.map((node) => {
      const serialized: FlowNode = {
        id: node.id,
        position: node.position,
        data: node.data,
        type: node.type,
      };
      if (node.parentId !== undefined) {
        serialized.parentId = node.parentId;
      }
      if (node.width !== undefined && node.width !== null) {
        serialized.width = node.width;
      }
      if (node.height !== undefined && node.height !== null) {
        serialized.height = node.height;
      }
      return serialized;
    }),
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
  const nodes = document.nodes.map((node) => {
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
    const parentId =
      typeof node.parentId === "string" && node.parentId.length > 0
        ? node.parentId
        : undefined;
    const width =
      typeof node.width === "number" && Number.isFinite(node.width)
        ? node.width
        : undefined;
    const height =
      typeof node.height === "number" && Number.isFinite(node.height)
        ? node.height
        : undefined;

    return {
      id: node.id,
      position,
      data: {
        ...BLOCK_DEFINITIONS[kind].defaults,
        ...rawData,
        kind,
      } as WorkbenchNode["data"],
      type: kind,
      ...(parentId !== undefined ? { parentId } : {}),
      ...(kind === "group"
        ? { zIndex: GROUP_Z_INDEX, draggable: false }
        : {}),
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
    };
  });
  return orderNodesParentFirst(nodes);
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
  portContext?: FlowPortContext,
): WorkbenchEdge[] {
  const ports = connectionPorts(nodes, connection, portContext);
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
  const targetNode = nodes.find((node) => node.id === connection.target);
  const allowsFlowFanIn =
    targetNode?.data.kind === "end" && ports.target.role === "flow";
  const next: WorkbenchEdge = {
    ...connection,
    id: `edge-${crypto.randomUUID()}`,
  };
  return [
    ...edges.filter(
      (edge) =>
        !(
          (!allowsFlowFanIn &&
            edge.target === next.target &&
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
  portContext?: FlowPortContext,
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
    portContext,
  );
  const targetPort = resolveFlowPort(
    target.data.kind,
    "input",
    connection.targetHandle ?? undefined,
    target.data,
    portContext,
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
  portContext?: FlowPortContext,
): boolean {
  return connectionPorts(nodes, connection, portContext) !== null;
}

export interface ClipboardNode {
  id: string;
  type: FlowBlockKind;
  position: XYPosition;
  data: WorkbenchNodeData;
  parentId?: string;
  width?: number;
  height?: number;
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

const CLIPBOARD_PREFIX = "android-platform:flow-clipboard:v1:";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPosition(value: unknown): value is XYPosition {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y)
  );
}

function isClipboardPayload(value: unknown): value is ClipboardPayload {
  if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    return false;
  }
  const nodes = value.nodes.every((node) => {
    if (!isRecord(node)) {
      return false;
    }
    return (
      typeof node.id === "string" &&
      node.id.length > 0 &&
      isFlowBlockKind(node.type) &&
      isPosition(node.position) &&
      isRecord(node.data) &&
      isFlowBlockKind(node.data.kind) &&
      (node.parentId === undefined || typeof node.parentId === "string") &&
      (node.width === undefined ||
        (typeof node.width === "number" && Number.isFinite(node.width))) &&
      (node.height === undefined ||
        (typeof node.height === "number" && Number.isFinite(node.height)))
    );
  });
  const edges = value.edges.every((edge) => {
    if (!isRecord(edge)) {
      return false;
    }
    return (
      typeof edge.source === "string" &&
      edge.source.length > 0 &&
      typeof edge.target === "string" &&
      edge.target.length > 0 &&
      (edge.sourceHandle === undefined || typeof edge.sourceHandle === "string") &&
      (edge.targetHandle === undefined || typeof edge.targetHandle === "string")
    );
  });
  return nodes && edges;
}

/** Serializes the selection so it can survive a script/editor switch. */
export function serializeClipboardPayload(payload: ClipboardPayload): string {
  return `${CLIPBOARD_PREFIX}${JSON.stringify(payload)}`;
}

/** Parses only clipboard text produced by this Flow editor. */
export function parseClipboardPayload(value: string): ClipboardPayload | null {
  if (!value.startsWith(CLIPBOARD_PREFIX)) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value.slice(CLIPBOARD_PREFIX.length));
    return isClipboardPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readStoredClipboardPayload(): ClipboardPayload | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const value = window.sessionStorage.getItem(StorageKey.WorkbenchFlowClipboard);
    return value === null ? null : parseClipboardPayload(value);
  } catch {
    return null;
  }
}

export function storeClipboardPayload(payload: ClipboardPayload): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(
      StorageKey.WorkbenchFlowClipboard,
      serializeClipboardPayload(payload),
    );
  } catch {
    // Clipboard persistence is a convenience; the in-memory clipboard remains usable.
  }
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
  const copied = new Set<string>();
  const picked: WorkbenchNode[] = [];
  for (const node of selected) {
    if (copied.has(node.id)) {
      continue;
    }
    copied.add(node.id);
    picked.push(node);
    if (node.type === "group") {
      for (const child of nodes) {
        if (
          child.parentId === node.id &&
          !copied.has(child.id) &&
          child.type !== "start" &&
          child.type !== "end"
        ) {
          copied.add(child.id);
          picked.push(child);
        }
      }
    }
  }
  const ids = copied;
  return {
    nodes: picked.map((node) => ({
      id: node.id,
      type: node.type,
      position: { x: node.position.x, y: node.position.y },
      data: node.data,
      ...(node.parentId !== undefined && node.parentId !== null
        ? { parentId: node.parentId }
        : {}),
      ...(node.width !== undefined && node.width !== null
        ? { width: node.width }
        : {}),
      ...(node.height !== undefined && node.height !== null
        ? { height: node.height }
        : {}),
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
      : (options?.offset ?? { x: UiConstants.PASTE_OFFSET_X, y: UiConstants.PASTE_OFFSET_Y });
  const idMap = new Map<string, string>();
  for (const node of payload.nodes) {
    idMap.set(node.id, `node-${crypto.randomUUID()}`);
  }
  const nodes: WorkbenchNode[] = payload.nodes.map((node) => {
    const id = idMap.get(node.id) as string;
    const next: WorkbenchNode = {
      id,
      type: node.type,
      position: {
        x: node.position.x + offset.x,
        y: node.position.y + offset.y,
      },
      data: node.data,
      selected: true,
      ...(node.type === "group"
        ? { zIndex: GROUP_Z_INDEX, draggable: true }
        : {}),
    };
    if (node.parentId !== undefined) {
      next.parentId = idMap.get(node.parentId) ?? node.parentId;
    }
    if (node.width !== undefined) {
      next.width = node.width;
    }
    if (node.height !== undefined) {
      next.height = node.height;
    }
    return next;
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

export interface NodeGeometry {
  position: XYPosition;
  width: number;
  height: number;
}

export const GROUP_PADDING = UiConstants.GROUP_PADDING;
export const DEFAULT_GROUP_WIDTH = UiConstants.GROUP_DEFAULT_WIDTH;
export const DEFAULT_GROUP_HEIGHT = UiConstants.GROUP_DEFAULT_HEIGHT;
/** Keeps an unparented group behind ordinary nodes that overlap its canvas. */
export const GROUP_Z_INDEX = -1;

function orderNodesParentFirst(nodes: WorkbenchNode[]): WorkbenchNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ordered: WorkbenchNode[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const append = (node: WorkbenchNode) => {
    if (visited.has(node.id)) {
      return;
    }
    // Invalid documents can contain a parent cycle. Keep those nodes usable
    // instead of recursing forever; the schema still preserves the data.
    if (visiting.has(node.id)) {
      visited.add(node.id);
      ordered.push(node);
      return;
    }
    visiting.add(node.id);
    if (node.parentId !== undefined) {
      const parent = byId.get(node.parentId);
      if (parent !== undefined) {
        append(parent);
      }
    }
    visiting.delete(node.id);
    if (!visited.has(node.id)) {
      visited.add(node.id);
      ordered.push(node);
    }
  };

  for (const node of nodes) {
    append(node);
  }
  return ordered;
}

function absolutePositionOf(
  node: WorkbenchNode,
  nodesById: ReadonlyMap<string, WorkbenchNode>,
  geometry: ReadonlyMap<string, NodeGeometry>,
  cache: Map<string, XYPosition>,
  visiting = new Set<string>(),
): XYPosition {
  const measured = geometry.get(node.id)?.position;
  if (measured !== undefined) {
    return measured;
  }
  const cached = cache.get(node.id);
  if (cached !== undefined) {
    return cached;
  }
  if (visiting.has(node.id)) {
    return node.position;
  }
  visiting.add(node.id);
  const parent =
    node.parentId === undefined ? undefined : nodesById.get(node.parentId);
  const parentPosition =
    parent === undefined
      ? { x: 0, y: 0 }
      : absolutePositionOf(parent, nodesById, geometry, cache, visiting);
  const position = {
    x: parentPosition.x + node.position.x,
    y: parentPosition.y + node.position.y,
  };
  visiting.delete(node.id);
  cache.set(node.id, position);
  return position;
}

function nodeRect(
  node: WorkbenchNode,
  nodesById: ReadonlyMap<string, WorkbenchNode>,
  geometry: ReadonlyMap<string, NodeGeometry>,
  positionCache: Map<string, XYPosition>,
): NodeGeometry {
  const measured = geometry.get(node.id);
  return {
    position: absolutePositionOf(node, nodesById, geometry, positionCache),
    width:
      measured?.width ??
      node.measured?.width ??
      node.width ??
      node.initialWidth ??
      0,
    height:
      measured?.height ??
      node.measured?.height ??
      node.height ??
      node.initialHeight ??
      0,
  };
}

function isRectInside(inner: NodeGeometry, outer: NodeGeometry): boolean {
  return (
    inner.position.x >= outer.position.x &&
    inner.position.y >= outer.position.y &&
    inner.position.x + inner.width <= outer.position.x + outer.width &&
    inner.position.y + inner.height <= outer.position.y + outer.height
  );
}

/**
 * Synchronizes group membership with the visible rectangles on the canvas.
 *
 * Top-level blocks dropped fully inside a group become direct children and
 * existing children that are resized outside the group are released while
 * retaining their absolute canvas position. React Flow then handles the
 * parent-child movement as a normal sub-flow operation.
 */
export function reconcileGroupMembership(
  nodes: WorkbenchNode[],
  geometry: ReadonlyMap<string, NodeGeometry> = new Map(),
): WorkbenchNode[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const positionCache = new Map<string, XYPosition>();
  const rectangles = new Map<string, NodeGeometry>();
  for (const node of nodes) {
    rectangles.set(node.id, nodeRect(node, nodesById, geometry, positionCache));
  }

  const groups = nodes.filter(
    (node) => node.type === "group" && node.parentId === undefined,
  );
  if (groups.length === 0) {
    return nodes;
  }

  let changed = false;
  let result = nodes;
  for (const group of groups) {
    const groupRect = rectangles.get(group.id);
    if (groupRect === undefined) {
      continue;
    }
    result = result.map((node) => {
      if (node.parentId !== group.id) {
        return node;
      }
      const childRect = rectangles.get(node.id);
      if (childRect === undefined || isRectInside(childRect, groupRect)) {
        return node;
      }
      changed = true;
      return {
        ...node,
        parentId: undefined,
        extent: null,
        position: { ...childRect.position },
      };
    });

    result = result.map((node) => {
      if (
        node.type === "group" ||
        node.parentId !== undefined ||
        node.id === group.id
      ) {
        return node;
      }
      const childRect = rectangles.get(node.id);
      if (childRect === undefined || !isRectInside(childRect, groupRect)) {
        return node;
      }
      changed = true;
      return {
        ...node,
        parentId: group.id,
        position: {
          x: childRect.position.x - groupRect.position.x,
          y: childRect.position.y - groupRect.position.y,
        },
      };
    });
  }

  return changed ? orderNodesParentFirst(result) : nodes;
}

/**
 * Wraps the selected top-level nodes in a resizable group container. Existing
 * groups and nodes already inside a group (unless the group is selected) are
 * left untouched, keeping nesting to a single level.
 */
export function groupSelectedNodes(
  nodes: WorkbenchNode[],
  geometry: ReadonlyMap<string, NodeGeometry>,
  selectedIds: readonly string[],
): WorkbenchNode[] {
  const selectedSet = new Set(selectedIds);
  const members = nodes.filter(
    (node) =>
      selectedSet.has(node.id) &&
      node.type !== "group" &&
      (node.parentId === undefined || node.parentId === null),
  );
  if (members.length === 0) {
    return nodes;
  }
  const memberIds = new Set(members.map((node) => node.id));
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of members) {
    const geo = geometry.get(node.id);
    const position = geo?.position ?? node.position;
    const width = geo?.width ?? node.width ?? 0;
    const height = geo?.height ?? node.height ?? 0;
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    maxX = Math.max(maxX, position.x + width);
    maxY = Math.max(maxY, position.y + height);
  }
  if (!Number.isFinite(minX)) {
    return nodes;
  }
  const groupX = minX - GROUP_PADDING;
  const groupY = minY - GROUP_PADDING;
  const groupWidth = maxX - minX + GROUP_PADDING * 2;
  const groupHeight = maxY - minY + GROUP_PADDING * 2;
  const groupId = `node-${crypto.randomUUID()}`;
  const groupNode: WorkbenchNode = {
    id: groupId,
    type: "group",
    position: { x: groupX, y: groupY },
    width: groupWidth,
    height: groupHeight,
    zIndex: GROUP_Z_INDEX,
    data: { kind: "group" },
    selected: true,
    draggable: true,
  };
  const result = nodes.map((node) => {
    if (!memberIds.has(node.id)) {
      return selectedSet.has(node.id) ? { ...node, selected: false } : node;
    }
    const geo = geometry.get(node.id);
    const position = geo?.position ?? node.position;
      return {
        ...node,
        parentId: groupId,
        position: {
        x: position.x - groupX,
        y: position.y - groupY,
      },
      selected: false,
    };
  });
  const firstMemberIndex = Math.min(
    ...result.map((node, index) =>
      memberIds.has(node.id) ? index : Number.POSITIVE_INFINITY,
    ),
  );
  result.splice(firstMemberIndex, 0, groupNode);
  return result;
}

/** Releases the direct children of the given groups back to the canvas. */
export function ungroupNodes(
  nodes: WorkbenchNode[],
  geometry: ReadonlyMap<string, NodeGeometry>,
  groupIds: readonly string[],
): WorkbenchNode[] {
  const groupSet = new Set(groupIds);
  let releasedAny = false;
  const result = nodes.map((node) => {
    if (groupSet.has(node.id)) {
      return { ...node, selected: false };
    }
    if (node.parentId !== undefined && groupSet.has(node.parentId)) {
      const geo = geometry.get(node.id);
      releasedAny = true;
      return {
        ...node,
        parentId: undefined,
        extent: null,
        position: { ...(geo?.position ?? node.position) },
        selected: true,
      };
    }
    return node;
  });
  return releasedAny ? result : nodes;
}

/**
 * Expands the given node ids to include every node nested inside a removed
 * group, matching React Flow's built-in delete behavior.
 */
export function collectRemovedNodeIds(
  nodes: WorkbenchNode[],
  rootIds: readonly string[],
): Set<string> {
  const ids = new Set(rootIds);
  for (const node of nodes) {
    if (node.parentId !== undefined && ids.has(node.parentId)) {
      ids.add(node.id);
    }
  }
  return ids;
}
