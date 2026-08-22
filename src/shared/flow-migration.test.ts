import { assert, describe, test } from "vitest";

import type { FlowDocument, FlowNode } from "./project-contracts";
import { migrateFlowDocument } from "./flow-migration";

function node(
  id: string,
  type: string,
  data: Record<string, unknown> = {},
): FlowNode {
  return {
    id,
    type: type as FlowNode["type"],
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
) {
  return { id, source, target, sourceHandle, targetHandle };
}

function document(nodes: FlowNode[], edges: ReturnType<typeof edge>[]): FlowDocument {
  return {
    schemaVersion: 1,
    nodes,
    edges: edges as FlowDocument["edges"],
  };
}

function byType(nodes: FlowNode[], type: string): FlowNode[] {
  return nodes.filter((candidate) => candidate.type === type);
}

describe("flow migration", () => {
  test("strips legacy variable fields from ocr, calculate, and for", () => {
    const result = migrateFlowDocument(
      document(
        [
          node("start", "start"),
          node("ocr", "ocr", {
            textVariable: "t",
            confidenceVariable: "c",
            matchedVariable: "m",
          }),
          node("calc", "calculate", { variable: "result", operation: "max" }),
          node("for", "for", { variable: "i", from: "0", to: "3", step: "1" }),
          node("end", "end"),
        ],
        [
          edge("e1", "start", "ocr"),
          edge("e2", "ocr", "calc"),
          edge("e3", "calc", "for"),
          edge("e4", "for", "end"),
        ],
      ),
    );

    const ocr = byType(result.document.nodes, "ocr")[0];
    const calc = byType(result.document.nodes, "calculate")[0];
    const forNode = byType(result.document.nodes, "for")[0];
    assert.equal("textVariable" in (ocr.data as object), false);
    assert.equal("confidenceVariable" in (ocr.data as object), false);
    assert.equal("matchedVariable" in (ocr.data as object), false);
    assert.equal("variable" in (calc.data as object), false);
    assert.equal("variable" in (forNode.data as object), false);
    assert.equal(forNode.data.from, 0);
    assert.equal(forNode.data.to, 3);
    assert.equal(forNode.data.step, 1);
    assert.equal(result.migrated, true);
  });

  test("converts a literal set-variable into a constant and bypasses control flow", () => {
    const result = migrateFlowDocument(
      document(
        [
          node("start", "start"),
          node("set", "set-variable", { name: "answer", expression: "42" }),
          node("end", "end"),
        ],
        [edge("e1", "start", "set"), edge("e2", "set", "end")],
      ),
    );

    const constants = byType(result.document.nodes, "constant");
    assert.equal(constants.length, 1);
    assert.equal(constants[0].data.numberValue, 42);
    assert.equal(byType(result.document.nodes, "set-variable").length, 0);
    const control = result.document.edges.filter(
      (candidate) =>
        candidate.sourceHandle === "next" && candidate.targetHandle === "in",
    );
    assert.deepEqual(
      control.map((candidate) => [candidate.source, candidate.target]),
      [["start", "end"]],
    );
    assert.equal(result.migrated, true);
  });

  test("converts an If compare-mode into a compare node, constant, and condition wiring", () => {
    const result = migrateFlowDocument(
      document(
        [
          node("start", "start"),
          node("seed", "set-variable", { name: "count", expression: "5" }),
          node("if", "if", { operator: ">", left: "$count", right: "3" }),
          node("end", "end"),
        ],
        [
          edge("e1", "start", "seed"),
          edge("e2", "seed", "if"),
          edge("e3", "if", "end", "true"),
          edge("e4", "if", "end", "false"),
        ],
      ),
    );

    const ifNode = byType(result.document.nodes, "if")[0];
    assert.equal("operator" in (ifNode.data as object), false);
    assert.equal("left" in (ifNode.data as object), false);
    assert.equal("right" in (ifNode.data as object), false);

    const compare = byType(result.document.nodes, "compare");
    assert.equal(compare.length, 1);
    assert.equal(compare[0].data.operator, ">");

    const constants = byType(result.document.nodes, "constant");
    assert.equal(constants.length, 2);
    assert.ok(constants.some((candidate) => candidate.data.numberValue === 3));
    assert.ok(constants.some((candidate) => candidate.data.numberValue === 5));

    const hasConditionEdge = result.document.edges.some(
      (candidate) =>
        candidate.target === "if" && candidate.targetHandle === "condition",
    );
    assert.equal(hasConditionEdge, true);
    assert.equal(result.migrated, true);
  });

  test("resolves a single-variable For bound into a data edge", () => {
    const result = migrateFlowDocument(
      document(
        [
          node("start", "start"),
          node("seed", "set-variable", { name: "limit", expression: "8" }),
          node("for", "for", { variable: "i", from: "0", to: "$limit", step: "1" }),
          node("end", "end"),
        ],
        [
          edge("e1", "start", "seed"),
          edge("e2", "seed", "for"),
          edge("e3", "for", "end", "done"),
        ],
      ),
    );

    const toEdge = result.document.edges.find(
      (candidate) =>
        candidate.target === "for" && candidate.targetHandle === "to",
    );
    assert.ok(toEdge !== undefined);
    assert.equal(toEdge.sourceHandle, "value");
    assert.equal(result.migrated, true);
  });

  test("converts a variable-referencing set-variable into an on-path calculate", () => {
    const result = migrateFlowDocument(
      document(
        [
          node("start", "start"),
          node("seed", "set-variable", { name: "base", expression: "2" }),
          node("set", "set-variable", { name: "double", expression: "$base * 2" }),
          node("end", "end"),
        ],
        [
          edge("e1", "start", "seed"),
          edge("e2", "seed", "set"),
          edge("e3", "set", "end"),
        ],
      ),
    );

    const calculate = byType(result.document.nodes, "calculate");
    assert.equal(calculate.length, 1);
    assert.equal(calculate[0].id, "set");
    assert.equal(calculate[0].data.operation, "expression");
    assert.equal(calculate[0].data.expression, "a * 2");

    const control = result.document.edges.filter(
      (candidate) =>
        candidate.sourceHandle === "next" && candidate.targetHandle === "in",
    );
    assert.ok(
      control.some(
        (candidate) => candidate.source === "set" && candidate.target === "end",
      ),
    );

    const inputEdge = result.document.edges.find(
      (candidate) =>
        candidate.target === "set" && candidate.targetHandle === "a",
    );
    assert.ok(inputEdge !== undefined);
    assert.equal(inputEdge.sourceHandle, "value");
    assert.equal(result.migrated, true);
  });
});
