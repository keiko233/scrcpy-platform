/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FlowDocumentSchema,
  type FlowDocument,
} from "../../../shared/project-contracts";
import type { WorkbenchNode } from "../types";
import { nodesFromDocument, toFlowDocument } from "./flow-document";

describe("workbench flow document", () => {
  it("persists only JSON-safe graph state", () => {
    const nodes: WorkbenchNode[] = [
      {
        id: "click-1",
        type: "click",
        position: { x: 12, y: 34 },
        data: { kind: "click", x: 10, y: 20 },
        selected: true,
      },
    ];

    const document = toFlowDocument(nodes, [], { x: 1, y: 2, zoom: 0.75 });

    assert.doesNotThrow(() => FlowDocumentSchema.parse(document));
    assert.deepEqual(document.nodes, [
      {
        id: "click-1",
        type: "click",
        position: { x: 12, y: 34 },
        data: { kind: "click", x: 10, y: 20 },
      },
    ]);
  });

  it("repairs legacy nodes with missing block metadata", () => {
    const legacy: FlowDocument = {
      schemaVersion: 1,
      nodes: [
        {
          id: "legacy-1",
          position: { x: "invalid", y: 9 },
          data: { note: "kept" },
        },
      ],
      edges: [],
    };

    const [node] = nodesFromDocument(legacy);

    assert.equal(node?.type, "delay");
    assert.deepEqual(node?.position, { x: 0, y: 9 });
    assert.deepEqual(node?.data, {
      kind: "delay",
      ms: 1000,
      note: "kept",
    });
  });
});
