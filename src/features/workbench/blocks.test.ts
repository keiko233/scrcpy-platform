import { describe, expect, it } from "vitest";

import {
  FLOW_NODE_DATA_PORTS,
  FLOW_NODE_PORTS,
} from "../../shared/project-contracts";

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

  it("declares typed OCR data outputs", () => {
    expect(FLOW_NODE_DATA_PORTS.ocr.outputs).toEqual([
      { id: "text", label: "Text", dataType: "string" },
      { id: "confidence", label: "Confidence", dataType: "number" },
      { id: "matched", label: "Matched", dataType: "boolean" },
    ]);
  });

  it("maps every connectable data input to an editable fallback field", () => {
    for (const [kind, ports] of Object.entries(FLOW_NODE_DATA_PORTS)) {
      const fieldNames = new Set(
        BLOCK_DEFINITIONS[kind as keyof typeof BLOCK_DEFINITIONS].fields.map(
          (field) => field.name,
        ),
      );
      for (const input of ports.inputs) {
        expect(
          fieldNames.has(input.field ?? input.id),
          `${kind}.${input.id} fallback field`,
        ).toBe(true);
      }
    }
  });
});
