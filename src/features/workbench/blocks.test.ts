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

  it("declares typed OCR data inputs", () => {
    expect(FLOW_NODE_DATA_PORTS.ocr.inputs).toEqual([
      {
        id: "region",
        label: "Region",
        dataType: "screen-region",
        field: "region",
      },
      {
        id: "expectedText",
        label: "Expected text",
        dataType: "string",
        field: "expectedText",
      },
    ]);
  });

  it("does not expose OCR configuration as connectable data inputs", () => {
    const configPorts = [
      "languages",
      "charSet",
      "matchMode",
      "caseSensitive",
      "timeoutMs",
      "intervalMs",
      "failOnTimeout",
    ];
    const ocrInputIds = FLOW_NODE_DATA_PORTS.ocr.inputs.map(
      (port) => port.id,
    );
    for (const id of configPorts) {
      expect(ocrInputIds, `ocr.${id} input`).not.toContain(id);
    }
  });

  it("keeps OCR configuration in its original inspector controls", () => {
    const fields = Object.fromEntries(
      BLOCK_DEFINITIONS.ocr.fields.map((field) => [field.name, field]),
    );

    expect(fields.languages?.kind).toBe("select");
    expect(fields.matchMode?.kind).toBe("select");
    expect(fields.caseSensitive?.kind).toBe("boolean");
    expect(fields.failOnTimeout?.kind).toBe("boolean");
    expect(fields.timeoutMs?.kind).toBe("number");
    expect(fields.intervalMs?.kind).toBe("number");
  });

  it("declares typed OCR data outputs", () => {
    expect(FLOW_NODE_DATA_PORTS.ocr.outputs).toEqual([
      { id: "text", label: "Text", dataType: "string" },
      { id: "confidence", label: "Confidence", dataType: "number" },
      { id: "matched", label: "Matched", dataType: "boolean" },
    ]);
  });

  it("declares the composite screen-region data output and keeps OCR region fields local", () => {
    expect(FLOW_NODE_DATA_PORTS["screen-region"].inputs).toEqual([]);
    expect(FLOW_NODE_DATA_PORTS["screen-region"].outputs).toEqual([
      { id: "region", label: "Region", dataType: "screen-region" },
    ]);
    const ocrFields = Object.fromEntries(
      BLOCK_DEFINITIONS.ocr.fields.map((field) => [field.name, field]),
    );
    expect(ocrFields.x?.kind).toBe("number");
    expect(ocrFields.y?.kind).toBe("number");
    expect(ocrFields.width?.kind).toBe("number");
    expect(ocrFields.height?.kind).toBe("number");
  });

  it("maps every connectable data input to an editable fallback field", () => {
    const connectionOnlyInputs = new Set(["ocr.region", "convert.value"]);
    for (const [kind, ports] of Object.entries(FLOW_NODE_DATA_PORTS)) {
      const fieldNames = new Set(
        BLOCK_DEFINITIONS[kind as keyof typeof BLOCK_DEFINITIONS].fields.map(
          (field) => field.name,
        ),
      );
      for (const input of ports.inputs) {
        if (connectionOnlyInputs.has(`${kind}.${input.id}`)) {
          continue;
        }
        expect(
          fieldNames.has(input.field ?? input.id),
          `${kind}.${input.id} fallback field`,
        ).toBe(true);
      }
    }
  });
});
