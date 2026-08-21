import {
  FLOW_NODE_PORTS,
  type FlowEdge,
  type FlowNode,
  type FlowNodeKind,
} from "./project-contracts";

export type FlowValidationIssueKind =
  | "duplicate-node-id"
  | "duplicate-edge-id"
  | "missing-start"
  | "multiple-starts"
  | "missing-end"
  | "multiple-ends"
  | "missing-endpoint"
  | "invalid-port"
  | "illegal-incoming"
  | "illegal-outgoing"
  | "cycle"
  | "unreachable-node";

export interface FlowValidationIssue {
  kind: FlowValidationIssueKind;
  message: string;
  nodeId?: string;
  edgeId?: string;
  port?: string;
}

export interface CompiledFlow {
  valid: boolean;
  issues: FlowValidationIssue[];
  order: string[];
}

function push(map: Map<string, FlowEdge[]>, key: string, edge: FlowEdge): void {
  const list = map.get(key);
  if (list) {
    list.push(edge);
  } else {
    map.set(key, [edge]);
  }
}

function resolvePort(
  declaredPorts: readonly string[],
  persistedPort: string | undefined,
): string {
  if (persistedPort !== undefined) {
    return persistedPort;
  }
  return declaredPorts.length === 1 ? declaredPorts[0] : "";
}

export function validateFlow(
  nodes: readonly FlowNode[],
  edges: readonly FlowEdge[],
): FlowValidationIssue[] {
  const issues: FlowValidationIssue[] = [];
  const nodeKinds = new Map<string, FlowNodeKind>();
  const seenNodeIds = new Set<string>();

  for (const node of nodes) {
    if (seenNodeIds.has(node.id)) {
      issues.push({
        kind: "duplicate-node-id",
        nodeId: node.id,
        message: `Duplicate node id "${node.id}".`,
      });
    }
    seenNodeIds.add(node.id);
    nodeKinds.set(node.id, node.type);
  }

  const seenEdgeIds = new Set<string>();
  for (const edge of edges) {
    if (seenEdgeIds.has(edge.id)) {
      issues.push({
        kind: "duplicate-edge-id",
        edgeId: edge.id,
        message: `Duplicate edge id "${edge.id}".`,
      });
    }
    seenEdgeIds.add(edge.id);
    if (!nodeKinds.has(edge.source)) {
      issues.push({
        kind: "missing-endpoint",
        edgeId: edge.id,
        message: `Edge "${edge.id}" references missing source node "${edge.source}".`,
      });
    }
    if (!nodeKinds.has(edge.target)) {
      issues.push({
        kind: "missing-endpoint",
        edgeId: edge.id,
        message: `Edge "${edge.id}" references missing target node "${edge.target}".`,
      });
    }
  }

  const starts = nodes.filter((node) => node.type === "start");
  const ends = nodes.filter((node) => node.type === "end");
  if (starts.length === 0) {
    issues.push({
      kind: "missing-start",
      message: "Flow must contain exactly one Start node.",
    });
  }
  for (const start of starts.slice(1)) {
    issues.push({
      kind: "multiple-starts",
      nodeId: start.id,
      message: `Flow contains more than one Start node; extra Start "${start.id}".`,
    });
  }
  if (ends.length === 0) {
    issues.push({
      kind: "missing-end",
      message: "Flow must contain exactly one End node.",
    });
  }
  for (const end of ends.slice(1)) {
    issues.push({
      kind: "multiple-ends",
      nodeId: end.id,
      message: `Flow contains more than one End node; extra End "${end.id}".`,
    });
  }

  const incoming = new Map<string, FlowEdge[]>();
  const outgoing = new Map<string, FlowEdge[]>();
  for (const edge of edges) {
    if (nodeKinds.has(edge.source) && nodeKinds.has(edge.target)) {
      push(outgoing, edge.source, edge);
      push(incoming, edge.target, edge);
    }
  }

  for (const edge of edges) {
    const sourceKind = nodeKinds.get(edge.source);
    const targetKind = nodeKinds.get(edge.target);
    if (sourceKind !== undefined) {
      const outputs: readonly string[] = FLOW_NODE_PORTS[sourceKind].outputs;
      const port = resolvePort(outputs, edge.sourceHandle);
      if (!outputs.includes(port)) {
        issues.push({
          kind: "invalid-port",
          edgeId: edge.id,
          port: edge.sourceHandle,
          message: `Edge "${edge.id}" uses source handle "${edge.sourceHandle ?? "(none)"}" which is not an output port of "${edge.source}" (${sourceKind}).`,
        });
      }
    }
    if (targetKind !== undefined) {
      const inputs: readonly string[] = FLOW_NODE_PORTS[targetKind].inputs;
      const port = resolvePort(inputs, edge.targetHandle);
      if (!inputs.includes(port)) {
        issues.push({
          kind: "invalid-port",
          edgeId: edge.id,
          port: edge.targetHandle,
          message: `Edge "${edge.id}" uses target handle "${edge.targetHandle ?? "(none)"}" which is not an input port of "${edge.target}" (${targetKind}).`,
        });
      }
    }
  }

  for (const node of nodes) {
    const incomingCount = incoming.get(node.id)?.length ?? 0;
    const expectedIncoming = node.type === "start" ? 0 : 1;
    if (incomingCount !== expectedIncoming) {
      issues.push({
        kind: "illegal-incoming",
        nodeId: node.id,
        message: `Node "${node.id}" has ${incomingCount} incoming edge(s); expected ${expectedIncoming}.`,
      });
    }

    const outgoingCount = outgoing.get(node.id)?.length ?? 0;
    const expectedOutgoing = node.type === "end" ? 0 : 1;
    if (outgoingCount !== expectedOutgoing) {
      issues.push({
        kind: "illegal-outgoing",
        nodeId: node.id,
        message: `Node "${node.id}" has ${outgoingCount} outgoing edge(s); expected ${expectedOutgoing}.`,
      });
    }
  }

  const cycle = detectCycle(nodes, outgoing);
  if (cycle !== null) {
    issues.push({
      kind: "cycle",
      nodeId: cycle[0],
      message: `Cycle detected in the flow graph: ${cycle.join(" -> ")}.`,
    });
  }

  if (starts.length === 1) {
    const reachable = reachableFrom(starts[0].id, outgoing);
    for (const node of nodes) {
      if (node.type !== "start" && !reachable.has(node.id)) {
        issues.push({
          kind: "unreachable-node",
          nodeId: node.id,
          message: `Node "${node.id}" is unreachable from Start.`,
        });
      }
    }
  }

  return issues.sort(
    (a, b) =>
      a.kind.localeCompare(b.kind) ||
      (a.nodeId ?? "").localeCompare(b.nodeId ?? "") ||
      (a.edgeId ?? "").localeCompare(b.edgeId ?? "") ||
      (a.port ?? "").localeCompare(b.port ?? "") ||
      a.message.localeCompare(b.message),
  );
}

export function compileFlow(
  nodes: readonly FlowNode[],
  edges: readonly FlowEdge[],
): CompiledFlow {
  const issues = validateFlow(nodes, edges);
  const order = issues.length === 0 ? linearOrder(nodes, edges) : [];
  return { valid: issues.length === 0, issues, order };
}

function linearOrder(
  nodes: readonly FlowNode[],
  edges: readonly FlowEdge[],
): string[] {
  const start = nodes.find((node) => node.type === "start");
  if (start === undefined) {
    return [];
  }
  const nodeIds = new Set(nodes.map((node) => node.id));
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    if (!nodeIds.has(edge.source)) {
      continue;
    }
    const targets = outgoing.get(edge.source);
    if (targets) {
      targets.push(edge.target);
    } else {
      outgoing.set(edge.source, [edge.target]);
    }
  }

  const order: string[] = [];
  const visited = new Set<string>();
  let current: string | undefined = start.id;
  while (current !== undefined && !visited.has(current)) {
    visited.add(current);
    order.push(current);
    current = (outgoing.get(current) ?? []).sort()[0];
  }
  return order;
}

function detectCycle(
  nodes: readonly FlowNode[],
  outgoing: Map<string, FlowEdge[]>,
): string[] | null {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  const visit = (nodeId: string): string[] | null => {
    visiting.add(nodeId);
    stack.push(nodeId);
    const targets = (outgoing.get(nodeId) ?? [])
      .map((edge) => edge.target)
      .sort();
    for (const target of targets) {
      if (visiting.has(target)) {
        const cycleStart = stack.indexOf(target);
        return [...stack.slice(cycleStart), target];
      }
      if (!visited.has(target)) {
        const cycle = visit(target);
        if (cycle !== null) {
          return cycle;
        }
      }
    }
    stack.pop();
    visiting.delete(nodeId);
    visited.add(nodeId);
    return null;
  };

  for (const node of [...nodes].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!visited.has(node.id)) {
      const cycle = visit(node.id);
      if (cycle !== null) {
        return cycle;
      }
    }
  }
  return null;
}

function reachableFrom(
  startId: string,
  outgoing: Map<string, FlowEdge[]>,
): Set<string> {
  const reachable = new Set<string>();
  const queue = [startId];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (reachable.has(current)) {
      continue;
    }
    reachable.add(current);
    for (const edge of outgoing.get(current) ?? []) {
      if (!reachable.has(edge.target)) {
        queue.push(edge.target);
      }
    }
  }
  return reachable;
}
