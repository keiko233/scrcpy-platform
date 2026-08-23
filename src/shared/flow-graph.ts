import {
  areFlowDataTypesCompatible,
  callTargetIdFromData,
  FLOW_NODE_PORTS,
  flowDataInputPorts,
  flowInputPortIds,
  resolveFlowPort,
  type FlowDocument,
  type FlowEdge,
  type FlowNode,
  type FlowNodeKind,
  type FlowPortContext,
  type FlowScriptSignature,
  type FlowValidationIssue,
  type ResolvedFlowPort,
  resolveConstantReference,
  resolveNodeReference,
} from "./project-contracts";

import {
  bestEffortFlowSignature,
  detectCallCycle,
  deriveFlowSignature,
  validateBoundaryNodes,
} from "./flow-signature";

export type {
  FlowValidationIssue,
  FlowValidationIssueKind,
} from "./project-contracts";

export interface ValidateFlowOptions {
  /**
   * Provides the persisted documents referenced by "call" nodes so they can
   * be checked for existence, signature compatibility and call cycles. When
   * omitted, call targets are not resolved and their data edges are skipped.
   */
  resolveDocument?: (scriptId: string) => FlowDocument | null | undefined;
}

export interface CompiledFlow {
  valid: boolean;
  issues: FlowValidationIssue[];
  order: string[];
}

function compareNodesByPosition(left: FlowNode, right: FlowNode): number {
  return (
    left.position.y - right.position.y ||
    left.position.x - right.position.x ||
    left.id.localeCompare(right.id)
  );
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
    (targetKind === "for" ||
      targetKind === "while" ||
      targetKind === "repeat-until" ||
      targetKind === "forever") &&
    edge.targetHandle === "loop"
  );
}

export function validateFlow(
  nodes: readonly FlowNode[],
  edges: readonly FlowEdge[],
  options: ValidateFlowOptions = {},
): FlowValidationIssue[] {
  const issues: FlowValidationIssue[] = [];
  const nodeKinds = new Map<string, FlowNodeKind>();
  const nodeData = new Map<string, FlowNode["data"]>();
  const nodeMap = new Map<string, FlowNode>();
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
    nodeData.set(node.id, node.data);
    nodeMap.set(node.id, node);
  }

  issues.push(
    ...validateBoundaryNodes([...nodes].sort(compareNodesByPosition)),
  );

  // Resolve "call" targets up front so edges touching unresolvable call
  // nodes can be skipped instead of flooding the report with port errors.
  const resolveDocument = options.resolveDocument;
  const documentCache = new Map<string, FlowDocument | null | undefined>();
  const signatureCache = new Map<string, FlowScriptSignature | null>();
  const bestEffortCache = new Map<string, FlowScriptSignature | null>();
  const callSignatures = new Map<string, FlowScriptSignature>();
  const unresolvedCalls = new Set<string>();
  const loadDocument = (scriptId: string): FlowDocument | null | undefined => {
    if (!documentCache.has(scriptId)) {
      documentCache.set(scriptId, resolveDocument?.(scriptId));
    }
    return documentCache.get(scriptId);
  };
  const signatureOfScript = (scriptId: string): FlowScriptSignature | null => {
    if (!signatureCache.has(scriptId)) {
      const cached = loadDocument(scriptId);
      if (cached === null || cached === undefined) {
        signatureCache.set(scriptId, null);
        bestEffortCache.set(scriptId, null);
      } else {
        const derived = deriveFlowSignature(cached);
        signatureCache.set(
          scriptId,
          derived.ok ? derived.signature : null,
        );
        bestEffortCache.set(scriptId, bestEffortFlowSignature(cached));
      }
    }
    return signatureCache.get(scriptId) ?? null;
  };
  /**
   * Lenient signature resolver used for port resolution so Call nodes can
   * expose wiring ports even while the target script is still being edited.
   */
  const bestEffortSignatureOfScript = (
    scriptId: string,
  ): FlowScriptSignature | null => {
    signatureOfScript(scriptId);
    return bestEffortCache.get(scriptId) ?? null;
  };
  for (const node of nodes) {
    if (node.type !== "call") {
      continue;
    }
    const targetId = callTargetIdFromData(node.data);
    if (targetId.length === 0) {
      issues.push({
        kind: "missing-call-target",
        nodeId: node.id,
        message: `Call node "${node.id}" does not select a target script.`,
      });
      unresolvedCalls.add(node.id);
      continue;
    }
    if (resolveDocument === undefined) {
      unresolvedCalls.add(node.id);
      continue;
    }
    if (
      resolveDocument !== undefined &&
      detectCallCycle(targetId, loadDocument) !== null
    ) {
      issues.push({
        kind: "call-cycle",
        nodeId: node.id,
        message: `Call node "${node.id}" participates in a script call cycle rooted at "${targetId}".`,
      });
    }
    const targetDocument = loadDocument(targetId);
    if (targetDocument === null || targetDocument === undefined) {
      issues.push({
        kind: "unknown-call-target",
        nodeId: node.id,
        message: `Call node "${node.id}" references unknown script "${targetId}".`,
      });
      unresolvedCalls.add(node.id);
      continue;
    }
    const derived = deriveFlowSignature(targetDocument);
    if (!derived.ok) {
      const kinds = [...new Set(derived.issues.map((issue) => issue.kind))].join(
        ", ",
      );
      issues.push({
        kind: "invalid-call-target",
        nodeId: node.id,
        message: `Call node "${node.id}" targets script "${targetId}" which has no usable signature (${kinds}).`,
      });
      // Keep best-effort ports so wiring feedback stays available while the
      // target is being repaired.
      continue;
    }
    callSignatures.set(node.id, derived.signature);
  }

  const portContext: FlowPortContext = {
    resolveCallSignature: bestEffortSignatureOfScript,
    resolveConstantReference: (sourceNodeId) =>
      resolveConstantReference(sourceNodeId, nodeMap),
    resolveNodeReference: (sourceNodeId) =>
      resolveNodeReference(sourceNodeId, nodeMap),
  };

  for (const node of nodes) {
    const isLegacyConstantReference = node.type === "constant-ref";
    const sourceNodeId = node.data.sourceNodeId;
    if (
      !isLegacyConstantReference &&
      typeof sourceNodeId !== "string"
    ) {
      continue;
    }
    if (typeof sourceNodeId !== "string" || sourceNodeId.length === 0) {
      issues.push({
        kind: isLegacyConstantReference
          ? "missing-constant-source"
          : "missing-reference-source",
        nodeId: node.id,
        message: isLegacyConstantReference
          ? `Constant reference node "${node.id}" does not select a source constant.`
          : `Reference node "${node.id}" does not select a source block.`,
      });
      continue;
    }
    if (!nodeMap.has(sourceNodeId)) {
      issues.push({
        kind: isLegacyConstantReference
          ? "unknown-constant-source"
          : "unknown-reference-source",
        nodeId: node.id,
        message: isLegacyConstantReference
          ? `Constant reference node "${node.id}" references unknown source "${sourceNodeId}".`
          : `Reference node "${node.id}" references unknown source "${sourceNodeId}".`,
      });
      continue;
    }
    const valid = isLegacyConstantReference
      ? resolveConstantReference(sourceNodeId, nodeMap) !== null
      : resolveNodeReference(sourceNodeId, nodeMap)?.type === node.type;
    if (!valid) {
      issues.push({
        kind: isLegacyConstantReference
          ? "invalid-constant-source"
          : "invalid-reference-source",
        nodeId: node.id,
        message: isLegacyConstantReference
          ? `Constant reference node "${node.id}" does not resolve to a constant value.`
          : `Reference node "${node.id}" must refer to a block of the same type without a reference cycle.`,
      });
    }
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
      sourcePort = resolveFlowPort(
        sourceKind,
        "output",
        edge.sourceHandle,
        nodeData.get(edge.source),
        portContext,
      );
      if (sourcePort === null) {
        if (unresolvedCalls.has(edge.source)) {
          continue;
        }
        issues.push({
          kind: "invalid-port",
          edgeId: edge.id,
          port: edge.sourceHandle,
          message: `Edge "${edge.id}" uses source handle "${edge.sourceHandle ?? "(none)"}" which is not an output port of "${edge.source}" (${sourceKind}).`,
        });
      }
    }
    if (targetKind !== undefined) {
      targetPort = resolveFlowPort(
        targetKind,
        "input",
        edge.targetHandle,
        nodeData.get(edge.target),
        portContext,
      );
      if (targetPort === null) {
        if (unresolvedCalls.has(edge.target)) {
          continue;
        }
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
      if (unresolvedCalls.has(edge.source) || unresolvedCalls.has(edge.target)) {
        continue;
      }
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
      if (unresolvedCalls.has(edge.source) || unresolvedCalls.has(edge.target)) {
        continue;
      }
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

  // A document is also an editing workspace: users may leave draft blocks on
  // the canvas before wiring them into the executable flow. Only nodes reached
  // from Start participate in control-flow completeness checks. The compiler
  // already walks from Start, so these draft nodes are naturally omitted from
  // the execution order.
  const reachableFlowNodes = new Set<string>();
  for (const start of starts) {
    for (const nodeId of reachableFrom(start.id, outgoing)) {
      reachableFlowNodes.add(nodeId);
    }
  }
  const hasReachableForever = [...reachableFlowNodes].some(
    (nodeId) => nodeKinds.get(nodeId) === "forever",
  );
  if (ends.length === 0 && !hasReachableForever) {
    issues.push({
      kind: "missing-end",
      message: "Flow must contain an End node unless it contains a reachable Forever loop.",
    });
  }

  for (const node of nodes) {
    if (!reachableFlowNodes.has(node.id)) {
      continue;
    }
    const incomingCount = incoming.get(node.id)?.length ?? 0;
    const inputs: readonly string[] = flowInputPortIds(
      node.type,
      node.data,
      portContext,
    );
    const expectedIncoming = inputs.length;
    const incomingValid = incomingCount >= expectedIncoming;
    if (!incomingValid) {
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
      const portValid = count >= 1;
      if (!portValid) {
        issues.push({
          kind: "illegal-port-count",
          nodeId: node.id,
          port,
          message: `Input port "${port}" on node "${node.id}" has ${count} edge(s); expected at least 1.`,
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
    for (const port of flowDataInputPorts(node.type, node.data, portContext)) {
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

  for (const node of nodes) {
    if (node.type !== "call") {
      continue;
    }
    const signature = callSignatures.get(node.id);
    if (signature === undefined) {
      continue;
    }
    for (const param of signature.params) {
      if (param.defaultValue !== undefined) {
        continue;
      }
      const count =
        incomingDataByPort.get(portKey(node.id, param.name))?.length ?? 0;
      if (count === 0) {
        issues.push({
          kind: "missing-call-argument",
          nodeId: node.id,
          port: param.name,
          message: `Parameter "${param.name}" on call node "${node.id}" has no incoming edge and no default value.`,
        });
      }
    }
  }

  const acyclicOutgoing = new Map<string, FlowEdge[]>();
  for (const edge of controlEdges) {
    if (
      nodeKinds.has(edge.source) &&
      nodeKinds.has(edge.target) &&
      reachableFlowNodes.has(edge.source) &&
      reachableFlowNodes.has(edge.target) &&
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
    if (
      !isLoopBackEdge(edge, nodeKinds) ||
      !reachableFlowNodes.has(edge.source) ||
      !reachableFlowNodes.has(edge.target)
    ) {
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
  options: ValidateFlowOptions = {},
): CompiledFlow {
  const issues = validateFlow(nodes, edges, options);
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
  const nodeData = new Map(nodes.map((node) => [node.id, node.data]));
  const outgoing = new Map<string, FlowEdge[]>();
  const incomingCount = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    const sourceKind = nodeKinds.get(edge.source);
    const targetKind = nodeKinds.get(edge.target);
    if (
      sourceKind === undefined ||
      targetKind === undefined ||
      resolveFlowPort(
        sourceKind,
        "output",
        edge.sourceHandle,
        nodeData.get(edge.source),
      )?.role !== "flow" ||
      resolveFlowPort(
        targetKind,
        "input",
        edge.targetHandle,
        nodeData.get(edge.target),
      )?.role !== "flow" ||
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
