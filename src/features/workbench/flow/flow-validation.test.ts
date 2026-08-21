/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compileFlow, validateFlow } from "../../../shared/flow-graph";
import type {
  FlowEdge,
  FlowNode,
  FlowNodeKind,
} from "../../../shared/project-contracts";

function node(id: string, type: FlowNodeKind): FlowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { kind: type },
  };
}

function edge(
  id: string,
  source: string,
  target: string,
  sourceHandle = "next",
  targetHandle = "in",
): FlowEdge {
  return { id, source, target, sourceHandle, targetHandle };
}

function linearGraph(): { nodes: FlowNode[]; edges: FlowEdge[] } {
  return {
    nodes: [
      node("start", "start"),
      node("click-1", "click"),
      node("delay-1", "delay"),
      node("end", "end"),
    ],
    edges: [
      edge("e1", "start", "click-1"),
      edge("e2", "click-1", "delay-1"),
      edge("e3", "delay-1", "end"),
    ],
  };
}

function issueKinds(
  issues: ReturnType<typeof validateFlow>,
): string[] {
  return issues.map((issue) => issue.kind);
}

describe("workbench flow validation", () => {
  it("accepts a valid linear graph", () => {
    const { nodes, edges } = linearGraph();
    const issues = validateFlow(nodes, edges);
    assert.deepEqual(issues, []);
  });

  it("reports duplicate node and edge ids", () => {
    const { nodes, edges } = linearGraph();
    const issues = validateFlow(
      [...nodes, node("start", "start")],
      [...edges, edge("e1", "click-1", "delay-1")],
    );
    assert.ok(issueKinds(issues).includes("duplicate-node-id"));
    assert.ok(issueKinds(issues).includes("duplicate-edge-id"));
  });

  it("reports missing and extra Start and End nodes", () => {
    const { nodes } = linearGraph();
    const edges = linearGraph().edges;
    const withoutStart = validateFlow(
      nodes.filter((n) => n.type !== "start"),
      edges,
    );
    assert.ok(issueKinds(withoutStart).includes("missing-start"));

    const twoStarts = validateFlow(
      [...nodes, node("start-2", "start")],
      edges,
    );
    assert.ok(issueKinds(twoStarts).includes("multiple-starts"));

    const withoutEnd = validateFlow(
      nodes.filter((n) => n.type !== "end"),
      edges,
    );
    assert.ok(issueKinds(withoutEnd).includes("missing-end"));

    const twoEnds = validateFlow([...nodes, node("end-2", "end")], edges);
    assert.ok(issueKinds(twoEnds).includes("multiple-ends"));
  });

  it("reports edges that reference missing nodes", () => {
    const { nodes } = linearGraph();
    const issues = validateFlow(nodes, [edge("e-bad", "start", "missing")]);
    const missing = issues.filter((issue) => issue.kind === "missing-endpoint");
    assert.equal(missing.length, 1);
    assert.equal(missing[0]?.edgeId, "e-bad");
  });

  it("reports invalid port ids", () => {
    const { nodes, edges } = linearGraph();
    const issues = validateFlow(nodes, [
      ...edges,
      edge("e-bad", "start", "click-1", "in", "in"),
    ]);
    const invalid = issues.filter((issue) => issue.kind === "invalid-port");
    assert.equal(invalid.length, 1);
    assert.equal(invalid[0]?.port, "in");
  });

  it("reports illegal incoming and outgoing counts", () => {
    const start = node("start", "start");
    const end = node("end", "end");
    const clickA = node("a", "click");
    const clickB = node("b", "click");

    const issues = validateFlow(
      [start, end, clickA, clickB],
      [
        edge("e1", "start", "a"),
        edge("e2", "start", "b"),
        edge("e3", "a", "end"),
        edge("e4", "b", "end"),
      ],
    );

    const outgoing = issues.filter((issue) => issue.kind === "illegal-outgoing");
    assert.ok(outgoing.some((issue) => issue.nodeId === "start"));
    const incoming = issues.filter((issue) => issue.kind === "illegal-incoming");
    assert.ok(incoming.some((issue) => issue.nodeId === "end"));
  });

  it("reports cycles", () => {
    const { nodes } = linearGraph();
    const issues = validateFlow(
      nodes.filter((n) => n.type !== "end"),
      [
        edge("e1", "start", "click-1"),
        edge("e2", "click-1", "delay-1"),
        edge("e3", "delay-1", "click-1"),
      ],
    );
    assert.ok(issueKinds(issues).includes("cycle"));
  });

  it("reports unreachable nodes", () => {
    const { nodes, edges } = linearGraph();
    const issues = validateFlow(
      [...nodes, node("orphan", "click")],
      edges,
    );
    const unreachable = issues.filter(
      (issue) => issue.kind === "unreachable-node",
    );
    assert.equal(unreachable.length, 1);
    assert.equal(unreachable[0]?.nodeId, "orphan");
  });

  it("compiles a deterministic linear plan starting at Start", () => {
    const { nodes, edges } = linearGraph();
    const compiled = compileFlow(nodes, edges);
    assert.equal(compiled.valid, true);
    assert.deepEqual(compiled.order, ["start", "click-1", "delay-1", "end"]);
  });

  it("compiles no order for an invalid graph", () => {
    const nodes = linearGraph().nodes;
    const compiled = compileFlow(nodes, []);
    assert.equal(compiled.valid, false);
    assert.deepEqual(compiled.order, []);
    assert.ok(issueKinds(compiled.issues).includes("illegal-outgoing"));
  });
});
