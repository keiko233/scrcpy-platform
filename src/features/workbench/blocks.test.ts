import { describe, expect, it } from "vitest";

import { FLOW_NODE_PORTS } from "../../shared/project-contracts";

import { BLOCK_DEFINITIONS } from "./blocks";

describe("workbench block definitions", () => {
  it("exposes the declared flow input and output ports", () => {
    for (const [kind, definition] of Object.entries(BLOCK_DEFINITIONS)) {
      expect(definition.inputPorts, `${kind} input ports`).toEqual(
        FLOW_NODE_PORTS[kind as keyof typeof FLOW_NODE_PORTS].inputs,
      );
      expect(definition.outputPorts, `${kind} output ports`).toEqual(
        FLOW_NODE_PORTS[kind as keyof typeof FLOW_NODE_PORTS].outputs,
      );
    }
  });

  it("classifies OCR result variables as outputs", () => {
    const outputNames = BLOCK_DEFINITIONS.ocr.fields
      .filter((field) => field.direction === "output")
      .map((field) => field.name);

    expect(outputNames).toEqual([
      "textVariable",
      "confidenceVariable",
      "matchedVariable",
    ]);
  });
});
