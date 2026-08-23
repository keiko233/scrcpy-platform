import { assert, describe, test } from "vitest";

import { validateFlow } from "./flow-graph";
import {
  collectCallTargets,
  detectCallCycle,
  deriveFlowSignature,
} from "./flow-signature";
import {
  matchesFlowDataType,
  type FlowDocument,
  type FlowEdge,
  type FlowNode,
} from "./project-contracts";

function node(
  id: string,
  type: string,
  data: Record<string, unknown> = {},
  position: { x: number; y: number } = { x: 0, y: 0 },
): FlowNode {
  return {
    id,
    type: type as FlowNode["type"],
    position,
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

function document(
  nodes: FlowNode[],
  edges: FlowEdge[] = [],
): FlowDocument {
  return { schemaVersion: 1, nodes, edges };
}

const issueKinds = (issues: { kind: string }[]) => issues.map((i) => i.kind);

function callableDocument(): FlowDocument {
  return document(
    [
      node("start", "start"),
      node("out", "output", {
        results: [{ name: "value", dataType: "number" }],
      }),
    ],
    [edge("e1", "start", "out")],
  );
}

describe("deriveFlowSignature", () => {
  test("derives params ordered by position and declared results", () => {
    const derived = deriveFlowSignature(
      document([
        node("start", "start"),
        node(
          "in-b",
          "input",
          { paramName: "label", dataType: "string" },
          { x: 0, y: 100 },
        ),
        node("in-a", "input", {
          paramName: "threshold",
          dataType: "number",
          defaultValue: 3,
        }),
        node("out", "output", {
          results: [
            { name: "text", dataType: "string" },
            { name: "count", dataType: "number" },
          ],
        }),
      ]),
    );
    assert.ok(derived.ok, JSON.stringify(derived));
    assert.deepEqual(
      derived.signature.params.map((param) => param.name),
      ["threshold", "label"],
    );
    assert.equal(derived.signature.params[0].defaultValue, 3);
    assert.deepEqual(derived.signature.results, [
      { name: "text", dataType: "string" },
      { name: "count", dataType: "number" },
    ]);
  });

  test("reports a plain start/end flow as not callable", () => {
    const derived = deriveFlowSignature(
      document(
        [node("start", "start"), node("end", "end")],
        [edge("e1", "start", "end")],
      ),
    );
    assert.ok(!derived.ok);
    assert.deepEqual(issueKinds(derived.issues), ["missing-output"]);
  });

  test("flags missing, invalid and duplicate parameter names", () => {
    const derived = deriveFlowSignature(
      document([
        node("start", "start"),
        node("in-empty", "input", { paramName: "" }),
        node("in-reserved", "input", { paramName: "next" }, { x: 10, y: 0 }),
        node("in-chars", "input", { paramName: "a-b" }, { x: 20, y: 0 }),
        node("in-dup", "input", { paramName: "a-b" }, { x: 30, y: 0 }),
        node(
          "out",
          "output",
          { results: [{ name: "value", dataType: "any" }] },
        ),
      ]),
    );
    assert.ok(!derived.ok);
    const kinds = issueKinds(derived.issues);
    assert.ok(kinds.includes("missing-param-name"));
    assert.ok(kinds.includes("invalid-param-name"));
    assert.ok(kinds.includes("duplicate-param-name"));
  });

  test("flags default value and data type mismatches", () => {
    const derived = deriveFlowSignature(
      document([
        node("start", "start"),
        node("in", "input", {
          paramName: "threshold",
          dataType: "number",
          defaultValue: "high",
        }),
        node(
          "out",
          "output",
          { results: [{ name: "value", dataType: "nope" }] },
        ),
      ]),
    );
    assert.ok(!derived.ok);
    const kinds = issueKinds(derived.issues);
    assert.ok(kinds.includes("invalid-default-value"));
    assert.ok(kinds.includes("invalid-data-type"));
  });

  test("flags unnamed and duplicate result entries on one output node", () => {
    const derived = deriveFlowSignature(
      document([
        node("start", "start"),
        node("out", "output", {
          results: [
            { name: "", dataType: "any" },
            { name: "value", dataType: "number" },
            { name: "value", dataType: "number" },
            { name: "bad name!", dataType: "any" },
          ],
        }),
      ]),
    );
    assert.ok(!derived.ok);
    const kinds = issueKinds(derived.issues);
    assert.ok(kinds.includes("missing-param-name"));
    assert.ok(kinds.includes("duplicate-result-name"));
    assert.ok(kinds.includes("invalid-param-name"));
  });

  test("accepts several output nodes with identical result sets", () => {
    const derived = deriveFlowSignature(
      document([
        node("start", "start"),
        node(
          "out-1",
          "output",
          { results: [{ name: "value", dataType: "number" }] },
          { x: 100, y: 0 },
        ),
        node(
          "out-2",
          "output",
          { results: [{ name: "value", dataType: "number" }] },
          { x: 200, y: 0 },
        ),
      ]),
    );
    assert.ok(derived.ok, JSON.stringify(derived));
    assert.deepEqual(derived.signature.results, [
      { name: "value", dataType: "number" },
    ]);
  });

  test("rejects output nodes with differing result sets", () => {
    const derived = deriveFlowSignature(
      document([
        node("start", "start"),
        node("out-1", "output", {
          results: [{ name: "value", dataType: "number" }],
        }),
        node("out-2", "output", {
          results: [
            { name: "value", dataType: "number" },
            { name: "extra", dataType: "string" },
          ],
        }),
      ]),
    );
    assert.ok(!derived.ok);
    assert.ok(issueKinds(derived.issues).includes("inconsistent-output-ports"));
  });
});

describe("validateFlow boundary rules", () => {
  test("allows End and Output nodes to coexist", () => {
    const issues = validateFlow(
      [
        node("start", "start"),
        node("end", "end"),
        node("out", "output", {
          results: [{ name: "value", dataType: "any" }],
        }),
      ],
      [
        edge("e1", "start", "out"),
        edge("e2", "out", "end"),
      ],
    );
    assert.ok(!issueKinds(issues).includes("end-and-output-mixed"));
    assert.deepEqual(issues, []);
  });

  test("still requires a terminal when neither End nor Output exists", () => {
    const issues = validateFlow([node("start", "start")], []);
    assert.ok(issueKinds(issues).includes("missing-end"));
  });

  test("surfaces boundary issues through graph validation", () => {
    const issues = validateFlow(
      [
        node("start", "start"),
        node("in", "input", { paramName: "9bad" }),
        node("out", "output", {
          results: [{ name: "value", dataType: "number" }],
        }),
      ],
      [edge("e1", "start", "in"), edge("e2", "in", "out")],
    );
    assert.ok(issueKinds(issues).includes("invalid-param-name"));
  });
});

describe("call site validation", () => {
  const childWithParam = document(
    [
      node("start", "start"),
      node("threshold", "input", {
        paramName: "threshold",
        dataType: "number",
      }),
      node("out", "output", {
        results: [{ name: "value", dataType: "number" }],
      }),
    ],
    [edge("ce1", "start", "out")],
  );

  function parentDocument(targetScriptId: unknown): FlowDocument {
    return document(
      [
        node("start", "start"),
        node("c", "call", { targetScriptId }),
        node("end", "end"),
      ],
      [edge("pe1", "start", "c"), edge("pe2", "c", "end")],
    );
  }

  test("accepts a call to a script without parameters", () => {
    const doc = parentDocument("child");
    const issues = validateFlow(doc.nodes, doc.edges, {
      resolveDocument: (id) => (id === "child" ? callableDocument() : null),
    });
    assert.deepEqual(issues, []);
  });

  test("requires an edge for parameters without default value", () => {
    const doc = parentDocument("child-with-param");
    const issues = validateFlow(doc.nodes, doc.edges, {
      resolveDocument: (id) =>
        id === "child-with-param" ? childWithParam : null,
    });
    const argumentIssue = issues.find(
      (issue) => issue.kind === "missing-call-argument",
    );
    assert.equal(argumentIssue?.port, "threshold");
  });

  test("does not require an edge for parameters with default value", () => {
    const childWithDefault = document(
      [
        node("start", "start"),
        node("threshold", "input", {
          paramName: "threshold",
          dataType: "number",
          defaultValue: 10,
        }),
        node("out", "output", {
          results: [{ name: "value", dataType: "number" }],
        }),
      ],
      [edge("ce1", "start", "out")],
    );
    const doc = parentDocument("child-with-default");
    const issues = validateFlow(doc.nodes, doc.edges, {
      resolveDocument: (id) =>
        id === "child-with-default" ? childWithDefault : null,
    });
    assert.deepEqual(issues, []);
  });

  test("checks parameter types against the target signature", () => {
    const doc = document(
      [
        node("start", "start"),
        node("c", "call", { targetScriptId: "child-with-param" }),
        node("cmp", "compare"),
        node("end", "end"),
      ],
      [
        edge("pe1", "start", "c"),
        edge("pe2", "c", "end"),
        edge("de1", "cmp", "c", "result", "threshold"),
      ],
    );
    const issues = validateFlow(doc.nodes, doc.edges, {
      resolveDocument: (id) =>
        id === "child-with-param" ? childWithParam : null,
    });
    assert.ok(issueKinds(issues).includes("incompatible-port-type"));
  });

  test("reports missing, unknown and invalid call targets", () => {
    const noTarget = validateFlow(parentDocument(undefined).nodes, []);
    assert.ok(issueKinds(noTarget).includes("missing-call-target"));

    const unknownDoc = parentDocument("ghost");
    const unknownTarget = validateFlow(unknownDoc.nodes, unknownDoc.edges, {
      resolveDocument: () => null,
    });
    assert.ok(issueKinds(unknownTarget).includes("unknown-call-target"));

    const plainChild = document(
      [node("start", "start"), node("end", "end")],
      [edge("ce1", "start", "end")],
    );
    const invalidDoc = parentDocument("plain");
    const invalidTarget = validateFlow(invalidDoc.nodes, invalidDoc.edges, {
      resolveDocument: (id) => (id === "plain" ? plainChild : null),
    });
    assert.ok(issueKinds(invalidTarget).includes("invalid-call-target"));
  });

  test("skips port errors for unresolved calls when no resolver is given", () => {
    const doc = document(
      [
        node("start", "start"),
        node("c", "call", { targetScriptId: "child" }),
        node("end", "end"),
      ],
      [
        edge("pe1", "start", "c"),
        edge("pe2", "c", "end"),
        edge("de1", "c", "c", "value", "value"),
      ],
    );
    const issues = validateFlow(doc.nodes, doc.edges);
    assert.deepEqual(issues, []);
  });

  test("detects self references and cross-script call cycles", () => {
    const solo = parentDocument("solo");
    const soloIssues = validateFlow(solo.nodes, solo.edges, {
      resolveDocument: (id) => (id === "solo" ? solo : null),
    });
    assert.ok(issueKinds(soloIssues).includes("call-cycle"));

    const alpha = parentDocument("beta");
    const beta = parentDocument("alpha");
    const alphaIssues = validateFlow(alpha.nodes, alpha.edges, {
      resolveDocument: (id) =>
        id === "alpha" ? alpha : id === "beta" ? beta : null,
    });
    assert.ok(issueKinds(alphaIssues).includes("call-cycle"));
  });

  test("detectCallCycle returns the offending path", () => {
    const docs: Record<string, FlowDocument> = {
      a: parentDocument("b"),
      b: parentDocument("c"),
      c: parentDocument("b"),
    };
    const cycle = detectCallCycle("a", (id) => docs[id] ?? null);
    assert.deepEqual(cycle, ["b", "c", "b"]);
    assert.equal(detectCallCycle("missing", () => null), null);
  });
});

describe("collectCallTargets", () => {
  test("collects distinct non-empty targets", () => {
    const targets = collectCallTargets(
      document([
        node("c1", "call", { targetScriptId: " a " }),
        node("c2", "call", { targetScriptId: "a" }),
        node("c3", "call", {}),
        node("other", "constant"),
      ]),
    );
    assert.deepEqual(targets, ["a"]);
  });
});

describe("matchesFlowDataType", () => {
  test("validates values against flow data types", () => {
    assert.equal(matchesFlowDataType(null, "any"), true);
    assert.equal(matchesFlowDataType("x", "string"), true);
    assert.equal(matchesFlowDataType(1, "string"), false);
    assert.equal(matchesFlowDataType(1.5, "number"), true);
    assert.equal(matchesFlowDataType("1", "number"), false);
    assert.equal(matchesFlowDataType(true, "boolean"), true);
    assert.equal(
      matchesFlowDataType({ x: 1, y: 2, width: 3, height: 4 }, "screen-region"),
      true,
    );
    assert.equal(
      matchesFlowDataType({ x: -1, y: 2, width: 3, height: 4 }, "screen-region"),
      false,
    );
  });
});
