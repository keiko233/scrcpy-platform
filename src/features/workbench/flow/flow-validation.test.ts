import { assert, describe, it } from "vitest";

import { compileFlow, validateFlow } from "../../../shared/flow-graph";
import type {
  FlowEdge,
  FlowNode,
  FlowNodeKind,
} from "../../../shared/project-contracts";

function node(
  id: string,
  type: FlowNodeKind,
  data: Record<string, unknown> = {},
): FlowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { kind: type, ...data } as FlowNode["data"],
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

  it("accepts optional typed data edges without counting them as control flow", () => {
    const nodes = [
      node("start", "start"),
      node("ocr", "ocr"),
      node("delay", "delay"),
      node("end", "end"),
    ];
    const issues = validateFlow(nodes, [
      edge("e1", "start", "ocr"),
      edge("e2", "ocr", "delay"),
      edge("e3", "delay", "end"),
      edge("data-1", "ocr", "delay", "confidence", "ms"),
    ]);

    assert.deepEqual(issues, []);
  });

  it("rejects data edges with incompatible types or flow/data roles", () => {
    const nodes = [
      node("start", "start"),
      node("ocr", "ocr"),
      node("delay", "delay"),
      node("end", "end"),
    ];
    const base = [
      edge("e1", "start", "ocr"),
      edge("e2", "ocr", "delay"),
      edge("e3", "delay", "end"),
    ];
    const wrongType = validateFlow(nodes, [
      ...base,
      edge("data-1", "ocr", "delay", "text", "ms"),
    ]);
    assert.ok(issueKinds(wrongType).includes("incompatible-port-type"));

    const wrongRole = validateFlow(nodes, [
      ...base,
      edge("data-2", "ocr", "delay", "next", "ms"),
    ]);
    assert.ok(issueKinds(wrongRole).includes("incompatible-port-role"));
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
    const join = node("join", "click");

    const issues = validateFlow(
      [start, end, clickA, clickB, join],
      [
        edge("e1", "start", "a"),
        edge("e2", "start", "b"),
        edge("e3", "a", "join"),
        edge("e4", "b", "join"),
        edge("e5", "join", "end"),
      ],
    );

    const outgoing = issues.filter((issue) => issue.kind === "illegal-outgoing");
    assert.ok(outgoing.some((issue) => issue.nodeId === "start"));
    const incoming = issues.filter((issue) => issue.kind === "illegal-incoming");
    assert.ok(incoming.some((issue) => issue.nodeId === "join"));
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

  it("allows disconnected draft nodes outside the executable flow", () => {
    const { nodes, edges } = linearGraph();
    const compiled = compileFlow(
      [...nodes, node("orphan", "click")],
      edges,
    );
    assert.equal(compiled.valid, true);
    assert.deepEqual(compiled.issues, []);
    assert.deepEqual(compiled.order, ["start", "click-1", "delay-1", "end"]);
  });

  it("allows multiple executable branches to terminate at End", () => {
    const nodes = [
      node("start", "start"),
      node("if", "if"),
      node("true-action", "click"),
      node("false-action", "delay"),
      node("end", "end"),
    ];
    const compiled = compileFlow(nodes, [
      edge("e1", "start", "if"),
      edge("e2", "if", "true-action", "true"),
      edge("e3", "if", "false-action", "false"),
      edge("e4", "true-action", "end"),
      edge("e5", "false-action", "end"),
    ]);

    assert.equal(compiled.valid, true);
    assert.deepEqual(compiled.issues, []);
  });

  it("compiles a deterministic linear plan starting at Start", () => {
    const { nodes, edges } = linearGraph();
    const compiled = compileFlow(nodes, edges);
    assert.equal(compiled.valid, true);
    assert.deepEqual(compiled.order, ["start", "click-1", "delay-1", "end"]);
  });

  it("validates both If branches and orders Merge after their branch bodies", () => {
    const nodes = [
      node("start", "start"),
      node("if", "if"),
      node("false-action", "delay"),
      node("true-action", "click"),
      node("merge", "merge"),
      node("end", "end"),
    ];
    const edges = [
      edge("e1", "start", "if"),
      edge("e2", "if", "true-action", "true"),
      edge("e3", "if", "false-action", "false"),
      edge("e4", "true-action", "merge", "next", "a"),
      edge("e5", "false-action", "merge", "next", "b"),
      edge("e6", "merge", "end"),
    ];

    const compiled = compileFlow(nodes, edges);
    assert.equal(compiled.valid, true);
    assert.deepEqual(compiled.issues, []);
    assert.deepEqual(compiled.order, [
      "start",
      "if",
      "false-action",
      "true-action",
      "merge",
      "end",
    ]);
  });

  it("accepts an explicit guarded loop-back but rejects ordinary cycles", () => {
    const nodes = [
      node("start", "start"),
      node("for", "for"),
      node("body", "click"),
      node("end", "end"),
    ];
    const loopEdges = [
      edge("e1", "start", "for", "next", "in"),
      edge("e2", "for", "body", "body", "in"),
      edge("e3", "body", "for", "next", "loop"),
      edge("e4", "for", "end", "done", "in"),
    ];

    const compiled = compileFlow(nodes, loopEdges);
    assert.equal(compiled.valid, true);
    assert.deepEqual(compiled.order, ["start", "for", "body", "end"]);

    const ordinaryCycle = validateFlow(nodes, [
      edge("e1", "start", "for", "next", "in"),
      edge("e2", "for", "body", "body", "in"),
      edge("e3", "body", "for", "next", "in"),
      edge("e4", "for", "end", "done", "in"),
    ]);
    assert.ok(issueKinds(ordinaryCycle).includes("cycle"));
    assert.ok(issueKinds(ordinaryCycle).includes("illegal-port-count"));
  });

  it("accepts the post-test Repeat-until loop-back", () => {
    const nodes = [
      node("start", "start"),
      node("repeat", "repeat-until"),
      node("body", "ocr"),
      node("end", "end"),
    ];
    const issues = validateFlow(nodes, [
      edge("e1", "start", "repeat", "next", "in"),
      edge("e2", "repeat", "body", "body", "in"),
      edge("e3", "body", "repeat", "next", "loop"),
      edge("e4", "repeat", "end", "done", "in"),
    ]);

    assert.deepEqual(issues, []);
  });

  it("requires one edge on every declared branch port", () => {
    const nodes = [
      node("start", "start"),
      node("if", "if"),
      node("end", "end"),
    ];
    const issues = validateFlow(nodes, [
      edge("e1", "start", "if"),
      edge("e2", "if", "end", "true", "in"),
    ]);
    assert.ok(
      issues.some(
        (issue) =>
          issue.kind === "illegal-port-count" &&
          issue.nodeId === "if" &&
          issue.port === "false",
      ),
    );
  });

  it("rejects a loop input reached from outside the loop body", () => {
    const nodes = [
      node("start", "start"),
      node("if", "if"),
      node("for", "for"),
      node("body", "click"),
      node("merge", "merge"),
      node("end", "end"),
    ];
    const issues = validateFlow(nodes, [
      edge("e1", "start", "if"),
      edge("e2", "if", "for", "true", "in"),
      edge("e3", "if", "for", "false", "loop"),
      edge("e4", "for", "body", "body", "in"),
      edge("e5", "body", "merge", "next", "a"),
      edge("e6", "for", "merge", "done", "b"),
      edge("e7", "merge", "end"),
    ]);

    assert.ok(
      issues.some(
        (issue) =>
          issue.kind === "invalid-loop-back" && issue.edgeId === "e3",
      ),
    );
  });

  it("accepts a single data edge from screen-region.region into ocr.region", () => {
    const nodes = [
      node("start", "start"),
      node("region", "screen-region"),
      node("ocr", "ocr"),
      node("end", "end"),
    ];
    const edges = [
      edge("e1", "start", "ocr"),
      edge("e2", "ocr", "end"),
      edge("data-1", "region", "ocr", "region", "region"),
    ];

    const compiled = compileFlow(nodes, edges);
    assert.equal(compiled.valid, true);
    assert.deepEqual(compiled.issues, []);
    assert.deepEqual(compiled.order, ["start", "ocr", "end"]);
  });

  it("rejects a data edge that feeds a non-region value into ocr.region", () => {
    const nodes = [
      node("start", "start"),
      node("region", "screen-region"),
      node("ocr", "ocr"),
      node("ocr-2", "ocr"),
      node("end", "end"),
    ];
    const base = [
      edge("e1", "start", "ocr"),
      edge("e2", "ocr", "ocr-2"),
      edge("e3", "ocr-2", "end"),
      edge("data-1", "region", "ocr", "region", "region"),
    ];
    const issues = validateFlow(nodes, [
      ...base,
      edge("data-2", "ocr", "ocr-2", "confidence", "region"),
    ]);

    assert.ok(issueKinds(issues).includes("incompatible-port-type"));
  });

  it("does not reject a data-only screen-region node as unreachable", () => {
    const nodes = [
      node("start", "start"),
      node("region", "screen-region"),
      node("end", "end"),
    ];
    const issues = validateFlow(nodes, [edge("e1", "start", "end")]);
    assert.deepEqual(issues, []);
  });

  it("compiles no order for an invalid graph", () => {
    const nodes = linearGraph().nodes;
    const compiled = compileFlow(nodes, []);
    assert.equal(compiled.valid, false);
    assert.deepEqual(compiled.order, []);
    assert.ok(issueKinds(compiled.issues).includes("illegal-outgoing"));
  });

  it("accepts dynamic calculate data inputs", () => {
    const nodes = [
      node("start", "start"),
      node("a", "calculate", { operation: "max", inputCount: 2 }),
      node("b", "calculate", { operation: "max", inputCount: 2 }),
      node("calc", "calculate", {
        inputCount: 2,
        variable: "r",
        operation: "sum",
      }),
      node("end", "end"),
    ];
    const edges = [
      edge("e1", "start", "a"),
      edge("e2", "a", "b"),
      edge("e3", "b", "calc"),
      edge("e4", "calc", "end"),
      edge("d1", "a", "calc", "value", "a"),
      edge("d2", "b", "calc", "value", "b"),
    ];

    const compiled = compileFlow(nodes, edges);
    assert.equal(compiled.valid, true);
    assert.deepEqual(compiled.issues, []);
  });

  it("rejects edges into undeclared dynamic calculate inputs", () => {
    const nodes = [
      node("start", "start"),
      node("a", "calculate", { operation: "max", inputCount: 2 }),
      node("calc", "calculate", {
        inputCount: 1,
        variable: "r",
        operation: "sum",
      }),
      node("end", "end"),
    ];
    const edges = [
      edge("e1", "start", "a"),
      edge("e2", "a", "calc"),
      edge("e3", "calc", "end"),
      edge("d1", "a", "calc", "value", "b"),
    ];

    const issues = validateFlow(nodes, edges);
    const invalid = issues.filter((issue) => issue.kind === "invalid-port");
    assert.equal(invalid.length, 1);
    assert.equal(invalid[0]?.port, "b");
  });

  it("rejects a dynamic merge whose declared inputs are not all wired", () => {
    const nodes = [
      node("start", "start"),
      node("if", "if"),
      node("a", "delay"),
      node("b", "delay"),
      node("merge", "merge", { inputCount: 3 }),
      node("end", "end"),
    ];
    const edges = [
      edge("e1", "start", "if"),
      edge("e2", "if", "a", "true"),
      edge("e3", "if", "b", "false"),
      edge("e4", "a", "merge", "next", "a"),
      edge("e5", "b", "merge", "next", "b"),
      edge("e6", "merge", "end"),
    ];

    const issues = validateFlow(nodes, edges);
    assert.ok(
      issues.some(
        (issue) =>
          issue.kind === "illegal-incoming" && issue.nodeId === "merge",
      ),
    );
    assert.ok(
      issues.some(
        (issue) =>
          issue.kind === "illegal-port-count" &&
          issue.nodeId === "merge" &&
          issue.port === "c",
      ),
    );
  });
});
