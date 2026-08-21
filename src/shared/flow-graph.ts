import {
  areFlowDataTypesCompatible,
  FLOW_NODE_DATA_PORTS,
  FLOW_NODE_PORTS,
  resolveFlowPort,
  type FlowEdge,
  type FlowNode,
  type FlowNodeKind,
  type ResolvedFlowPort,
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
  | "incompatible-port-role"
  | "incompatible-port-type"
  | "illegal-port-count"
  | "invalid-loop-back"
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

function portKey(nodeId: string, port: string): string {
  return `${nodeId}\u0000${port}`;
}

function isLoopBackEdge(
  edge: FlowEdge,
  nodeKinds: ReadonlyMap<string, FlowNodeKind>,
): boolean {
  const targetKind = nodeKinds.get(edge.target);
  return (
    (targetKind === "for" || targetKind === "while") &&
    edge.targetHandle === "loop"
  );
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
  const incomingByPort = new Map<string, FlowEdge[]>();
  const outgoingByPort = new Map<string, FlowEdge[]>();
  const incomingDataByPort = new Map<string, FlowEdge[]>();
  const controlEdges: FlowEdge[] = [];

  for (const edge of edges) {
    const sourceKind = nodeKinds.get(edge.source);
    const targetKind = nodeKinds.get(edge.target);
    let sourcePort: ResolvedFlowPort | null = null;
    let targetPort: ResolvedFlowPort | null = null;
    if (sourceKind !== undefined) {
      sourcePort = resolveFlowPort(sourceKind, "output", edge.sourceHandle);
      if (sourcePort === null) {
        issues.push({
          kind: "invalid-port",
          edgeId: edge.id,
          port: edge.sourceHandle,
          message: `Edge "${edge.id}" uses source handle "${edge.sourceHandle ?? "(none)"}" which is not an output port of "${edge.source}" (${sourceKind}).`,
        });
      }
    }
    if (targetKind !== undefined) {
      targetPort = resolveFlowPort(targetKind, "input", edge.targetHandle);
      if (targetPort === null) {
        issues.push({
          kind: "invalid-port",
          edgeId: edge.id,
          port: edge.targetHandle,
          message: `Edge "${edge.id}" uses target handle "${edge.targetHandle ?? "(none)"}" which is not an input port of "${edge.target}" (${targetKind}).`,
        });
      }
    }
    if (sourcePort === null || targetPort === null) {
      continue;
    }
    if (sourcePort.role !== targetPort.role) {
      issues.push({
        kind: "incompatible-port-role",
        edgeId: edge.id,
        message: `Edge "${edge.id}" cannot connect ${sourcePort.role} output "${edge.source}.${sourcePort.id}" to ${targetPort.role} input "${edge.target}.${targetPort.id}".`,
      });
      continue;
    }
    if (
      sourcePort.role === "data" &&
      targetPort.role === "data" &&
      !areFlowDataTypesCompatible(sourcePort.dataType, targetPort.dataType)
    ) {
      issues.push({
        kind: "incompatible-port-type",
        edgeId: edge.id,
        message: `Edge "${edge.id}" cannot connect ${sourcePort.dataType} output "${edge.source}.${sourcePort.id}" to ${targetPort.dataType} input "${edge.target}.${targetPort.id}".`,
      });
      continue;
    }
    if (sourcePort.role === "flow") {
      controlEdges.push(edge);
      push(outgoing, edge.source, edge);
      push(incoming, edge.target, edge);
      push(outgoingByPort, portKey(edge.source, sourcePort.id), edge);
      push(incomingByPort, portKey(edge.target, targetPort.id), edge);
    } else {
      push(incomingDataByPort, portKey(edge.target, targetPort.id), edge);
    }
  }

  for (const node of nodes) {
    const incomingCount = incoming.get(node.id)?.length ?? 0;
    const inputs: readonly string[] = FLOW_NODE_PORTS[node.type].inputs;
    const expectedIncoming = inputs.length;
    if (incomingCount !== expectedIncoming) {
      issues.push({
        kind: "illegal-incoming",
        nodeId: node.id,
        message: `Node "${node.id}" has ${incomingCount} incoming edge(s); expected ${expectedIncoming}.`,
      });
    }

    const outgoingCount = outgoing.get(node.id)?.length ?? 0;
    const outputs: readonly string[] = FLOW_NODE_PORTS[node.type].outputs;
    const expectedOutgoing = outputs.length;
    if (outgoingCount !== expectedOutgoing) {
      issues.push({
        kind: "illegal-outgoing",
        nodeId: node.id,
        message: `Node "${node.id}" has ${outgoingCount} outgoing edge(s); expected ${expectedOutgoing}.`,
      });
    }

    for (const port of inputs) {
      const count = incomingByPort.get(portKey(node.id, port))?.length ?? 0;
      if (count !== 1) {
        issues.push({
          kind: "illegal-port-count",
          nodeId: node.id,
          port,
          message: `Input port "${port}" on node "${node.id}" has ${count} edge(s); expected 1.`,
        });
      }
    }
    for (const port of outputs) {
      const count = outgoingByPort.get(portKey(node.id, port))?.length ?? 0;
      if (count !== 1) {
        issues.push({
          kind: "illegal-port-count",
          nodeId: node.id,
          port,
          message: `Output port "${port}" on node "${node.id}" has ${count} edge(s); expected 1.`,
        });
      }
    }
    for (const port of FLOW_NODE_DATA_PORTS[node.type].inputs) {
      const count = incomingDataByPort.get(portKey(node.id, port.id))?.length ?? 0;
      if (count > 1) {
        issues.push({
          kind: "illegal-port-count",
          nodeId: node.id,
          port: port.id,
          message: `Data input port "${port.id}" on node "${node.id}" has ${count} edges; expected at most 1.`,
        });
      }
    }
  }

  const acyclicOutgoing = new Map<string, FlowEdge[]>();
  for (const edge of controlEdges) {
    if (
      nodeKinds.has(edge.source) &&
      nodeKinds.has(edge.target) &&
      !isLoopBackEdge(edge, nodeKinds)
    ) {
      push(acyclicOutgoing, edge.source, edge);
    }
  }
  const cycle = detectCycle(nodes, acyclicOutgoing);
  if (cycle !== null) {
    issues.push({
      kind: "cycle",
      nodeId: cycle[0],
      message: `Cycle detected in the flow graph: ${cycle.join(" -> ")}.`,
    });
  }

  for (const edge of controlEdges) {
    if (!isLoopBackEdge(edge, nodeKinds)) {
      continue;
    }
    const bodyEdge = outgoingByPort.get(portKey(edge.target, "body"))?.[0];
    if (
      bodyEdge !== undefined &&
      !reachableFrom(bodyEdge.target, acyclicOutgoing).has(edge.source)
    ) {
      issues.push({
        kind: "invalid-loop-back",
        edgeId: edge.id,
        nodeId: edge.target,
        port: "loop",
        message: `Edge "${edge.id}" enters loop port "${edge.target}.loop" from outside that loop's body path.`,
      });
    }
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
  const order = issues.length === 0 ? deterministicOrder(nodes, edges) : [];
  return { valid: issues.length === 0, issues, order };
}

function deterministicOrder(
  nodes: readonly FlowNode[],
  edges: readonly FlowEdge[],
): string[] {
  const start = nodes.find((node) => node.type === "start");
  if (start === undefined) {
    return [];
  }
  const nodeKinds = new Map(nodes.map((node) => [node.id, node.type]));
  const outgoing = new Map<string, FlowEdge[]>();
  const incomingCount = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    const sourceKind = nodeKinds.get(edge.source);
    const targetKind = nodeKinds.get(edge.target);
    if (
      sourceKind === undefined ||
      targetKind === undefined ||
      resolveFlowPort(sourceKind, "output", edge.sourceHandle)?.role !== "flow" ||
      resolveFlowPort(targetKind, "input", edge.targetHandle)?.role !== "flow" ||
      isLoopBackEdge(edge, nodeKinds)
    ) {
      continue;
    }
    push(outgoing, edge.source, edge);
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
  }

  const order: string[] = [];
  const queued = new Set<string>([start.id]);
  const ready = [start.id];
  while (ready.length > 0) {
    const nodeId = ready.shift() as string;
    order.push(nodeId);
    const edgesFromNode = [...(outgoing.get(nodeId) ?? [])].sort(
      (left, right) =>
        (left.sourceHandle ?? "").localeCompare(right.sourceHandle ?? "") ||
        left.target.localeCompare(right.target),
    );
    for (const edge of edgesFromNode) {
      const remaining = (incomingCount.get(edge.target) ?? 0) - 1;
      incomingCount.set(edge.target, remaining);
      if (remaining === 0 && !queued.has(edge.target)) {
        queued.add(edge.target);
        ready.push(edge.target);
      }
    }
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
