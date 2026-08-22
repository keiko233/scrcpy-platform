import { assert, describe, it } from "vitest";

import {
  EMPTY_FLOW_DOCUMENT,
  FlowDocumentSchema,
  type FlowDocument,
} from "../../../shared/project-contracts";
import type { WorkbenchEdge, WorkbenchNode } from "../types";
import {
  copySelection,
  edgesFromDocument,
  mergeEdge,
  nodesFromDocument,
  pasteSelection,
  toFlowDocument,
  type ClipboardPayload,
} from "./flow-document";

function workbenchNode(
  id: string,
  type: WorkbenchNode["type"],
): WorkbenchNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { kind: type },
  } as WorkbenchNode;
}

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
    const legacy = {
      schemaVersion: 1,
      nodes: [
        {
          id: "legacy-1",
          position: { x: "invalid", y: 9 },
          data: { note: "kept" },
        },
      ],
      edges: [],
    } as unknown as FlowDocument;

    const [node] = nodesFromDocument(legacy);

    assert.equal(node?.type, "delay");
    assert.deepEqual(node?.position, { x: 0, y: 9 });
    assert.deepEqual(node?.data, {
      kind: "delay",
      ms: 1000,
      note: "kept",
    });
  });

  it("round-trips start and end nodes with declared ports", () => {
    const document: FlowDocument = {
      schemaVersion: 1,
      nodes: [
        {
          id: "start",
          type: "start",
          position: { x: 0, y: 0 },
          data: { kind: "start" },
        },
        {
          id: "end",
          type: "end",
          position: { x: 320, y: 0 },
          data: { kind: "end" },
        },
      ],
      edges: [
        {
          id: "start-end",
          source: "start",
          target: "end",
          sourceHandle: "next",
          targetHandle: "in",
        },
      ],
    };

    assert.doesNotThrow(() => FlowDocumentSchema.parse(document));

    const nodes = nodesFromDocument(document);
    assert.deepEqual(
      nodes.map((node) => node.type),
      ["start", "end"],
    );
    assert.deepEqual(nodes[0]?.data, { kind: "start" });
    assert.deepEqual(nodes[1]?.data, { kind: "end" });

    const restored = toFlowDocument(nodes, [], { x: 0, y: 0, zoom: 1 });
    assert.doesNotThrow(() => FlowDocumentSchema.parse(restored));
  });

  it("keeps existing valid action-node drafts parseable without Start and End", () => {
    const actionOnly: FlowDocument = {
      schemaVersion: 1,
      nodes: [
        {
          id: "delay-1",
          type: "delay",
          position: { x: 0, y: 0 },
          data: { kind: "delay", ms: 500 },
        },
      ],
      edges: [],
    };

    assert.equal(FlowDocumentSchema.safeParse(actionOnly).success, true);
  });

  it("rejects malformed node positions and unknown position keys", () => {
    const malformed = {
      schemaVersion: 1,
      nodes: [
        {
          id: "n1",
          type: "click",
          position: { x: "bad", y: 1 },
          data: { kind: "click" },
        },
      ],
      edges: [],
    } as unknown;
    assert.equal(FlowDocumentSchema.safeParse(malformed).success, false);

    const extraKeys = {
      schemaVersion: 1,
      nodes: [
        {
          id: "n1",
          type: "click",
          position: { x: 0, y: 0, z: 1 },
          data: { kind: "click" },
        },
      ],
      edges: [],
    } as unknown;
    assert.equal(FlowDocumentSchema.safeParse(extraKeys).success, false);
  });

  it("rejects node types and data-kind disagreement", () => {
    const mismatched = {
      schemaVersion: 1,
      nodes: [
        {
          id: "n1",
          type: "click",
          position: { x: 0, y: 0 },
          data: { kind: "delay" },
        },
      ],
      edges: [],
    } as unknown;
    assert.equal(FlowDocumentSchema.safeParse(mismatched).success, false);
  });

  it("rejects edges with invalid or empty endpoints", () => {
    const emptySource = {
      schemaVersion: 1,
      nodes: [],
      edges: [{ id: "e1", source: "", target: "n1" }],
    } as unknown;
    assert.equal(FlowDocumentSchema.safeParse(emptySource).success, false);

    const numericTarget = {
      schemaVersion: 1,
      nodes: [],
      edges: [{ id: "e1", source: "n1", target: 5 }],
    } as unknown;
    assert.equal(FlowDocumentSchema.safeParse(numericTarget).success, false);
  });

  it("rejects invalid viewport values and unknown keys", () => {
    const zeroZoom = {
      schemaVersion: 1,
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 0 },
    } as unknown;
    assert.equal(FlowDocumentSchema.safeParse(zeroZoom).success, false);

    const extraKey = {
      schemaVersion: 1,
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1, extra: true },
    } as unknown;
    assert.equal(FlowDocumentSchema.safeParse(extraKey).success, false);
  });

  it("default document starts connected to End and is schema-valid", () => {
    assert.doesNotThrow(() => FlowDocumentSchema.parse(EMPTY_FLOW_DOCUMENT));
    assert.deepEqual(
      EMPTY_FLOW_DOCUMENT.nodes.map((node) => node.type),
      ["start", "end"],
    );
    assert.equal(EMPTY_FLOW_DOCUMENT.edges.length, 1);
    assert.equal(EMPTY_FLOW_DOCUMENT.edges[0]?.source, "start");
    assert.equal(EMPTY_FLOW_DOCUMENT.edges[0]?.target, "end");
  });

  it("adds default port IDs when loading an older edge", () => {
    const legacyEdgeDocument: FlowDocument = {
      schemaVersion: 1,
      nodes: [],
      edges: [{ id: "e1", source: "a", target: "b" }],
    };

    assert.deepEqual(edgesFromDocument(legacyEdgeDocument), [
      {
        id: "e1",
        source: "a",
        target: "b",
        sourceHandle: "next",
        targetHandle: "in",
      },
    ]);
  });

  it("mergeEdge ignores exact duplicate connections", () => {
    const existing: WorkbenchEdge[] = [
      {
        id: "e1",
        source: "start",
        target: "click-1",
        sourceHandle: "next",
        targetHandle: "in",
      },
    ];

    const merged = mergeEdge(
      existing,
      {
        source: "start",
        target: "click-1",
        sourceHandle: "next",
        targetHandle: "in",
      },
      [workbenchNode("start", "start"), workbenchNode("click-1", "click")],
    );

    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.id, "e1");
  });

  it("mergeEdge replaces an existing edge occupying the same target handle", () => {
    const existing: WorkbenchEdge[] = [
      {
        id: "e1",
        source: "start",
        target: "click-1",
        sourceHandle: "next",
        targetHandle: "in",
      },
    ];

    const merged = mergeEdge(
      existing,
      {
        source: "delay-1",
        target: "click-1",
        sourceHandle: "next",
        targetHandle: "in",
      },
      [workbenchNode("delay-1", "delay"), workbenchNode("click-1", "click")],
    );

    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.source, "delay-1");
    assert.equal(merged[0]?.target, "click-1");
    assert.notEqual(merged[0]?.id, "e1");
  });

  it("mergeEdge replaces an existing edge occupying the same source handle", () => {
    const existing: WorkbenchEdge[] = [
      {
        id: "e1",
        source: "start",
        target: "click-1",
        sourceHandle: "next",
        targetHandle: "in",
      },
    ];

    const merged = mergeEdge(
      existing,
      {
        source: "start",
        target: "delay-1",
        sourceHandle: "next",
        targetHandle: "in",
      },
      [workbenchNode("start", "start"), workbenchNode("delay-1", "delay")],
    );

    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.target, "delay-1");
    assert.notEqual(merged[0]?.id, "e1");
  });

  it("allows typed data outputs to fan out to multiple compatible inputs", () => {
    const nodes = [
      workbenchNode("ocr", "ocr"),
      workbenchNode("delay-1", "delay"),
      workbenchNode("delay-2", "delay"),
    ];
    const existing: WorkbenchEdge[] = [
      {
        id: "data-1",
        source: "ocr",
        target: "delay-1",
        sourceHandle: "confidence",
        targetHandle: "ms",
      },
    ];

    const merged = mergeEdge(
      existing,
      {
        source: "ocr",
        target: "delay-2",
        sourceHandle: "confidence",
        targetHandle: "ms",
      },
      nodes,
    );

    assert.equal(merged.length, 2);
    assert.deepEqual(
      merged.map((edge) => edge.target).sort(),
      ["delay-1", "delay-2"],
    );
  });

  it("ignores incompatible typed data connections", () => {
    const nodes = [
      workbenchNode("ocr", "ocr"),
      workbenchNode("delay", "delay"),
    ];
    const existing: WorkbenchEdge[] = [];

    const merged = mergeEdge(
      existing,
      {
        source: "ocr",
        target: "delay",
        sourceHandle: "text",
        targetHandle: "ms",
      },
      nodes,
    );

    assert.equal(merged, existing);
  });
});

describe("workbench copy and paste", () => {
  it("returns null when no action node is selected", () => {
    const nodes = [
      workbenchNode("start", "start"),
      workbenchNode("end", "end"),
    ];

    assert.equal(copySelection(nodes, []), null);
  });

  it("excludes start and end nodes from the copied selection", () => {
    const nodes: WorkbenchNode[] = [
      { ...workbenchNode("start", "start"), selected: true },
      { ...workbenchNode("a", "click"), selected: true },
      { ...workbenchNode("end", "end"), selected: true },
    ];

    const payload = copySelection(nodes, []);

    assert.ok(payload !== null);
    assert.deepEqual(
      payload.nodes.map((node) => node.id),
      ["a"],
    );
  });

  it("captures only internal edges between copied nodes", () => {
    const nodes: WorkbenchNode[] = [
      { ...workbenchNode("a", "click"), selected: true },
      { ...workbenchNode("b", "delay"), selected: true },
      workbenchNode("c", "delay"),
    ];
    const edges: WorkbenchEdge[] = [
      {
        id: "e1",
        source: "a",
        target: "b",
        sourceHandle: "next",
        targetHandle: "in",
      },
      {
        id: "e2",
        source: "b",
        target: "c",
        sourceHandle: "next",
        targetHandle: "in",
      },
    ];

    const payload = copySelection(nodes, edges);

    assert.ok(payload !== null);
    assert.deepEqual(
      payload.edges.map((edge) => edge.source),
      ["a"],
    );
    assert.equal(payload.edges[0]?.targetHandle, "in");
  });

  it("clones nodes and edges with fresh ids and offset positions", () => {
    const payload: ClipboardPayload = {
      nodes: [
        {
          id: "a",
          type: "click",
          position: { x: 10, y: 10 },
          data: { kind: "click", x: 1, y: 2 },
        },
        {
          id: "b",
          type: "delay",
          position: { x: 30, y: 10 },
          data: { kind: "delay", ms: 500 },
        },
      ],
      edges: [
        { source: "a", target: "b", sourceHandle: "next", targetHandle: "in" },
      ],
    };

    const { nodes, edges } = pasteSelection(payload);

    assert.equal(nodes.length, 2);
    const [first, second] = nodes;
    assert.ok(first !== undefined && second !== undefined);
    assert.notEqual(first.id, "a");
    assert.notEqual(second.id, "b");
    assert.notEqual(first.id, second.id);
    assert.equal(first.selected, true);
    assert.deepEqual(first.position, { x: 50, y: 50 });
    assert.deepEqual(second.position, { x: 70, y: 50 });
    assert.deepEqual(first.data, { kind: "click", x: 1, y: 2 });

    assert.equal(edges.length, 1);
    assert.equal(edges[0]?.source, first.id);
    assert.equal(edges[0]?.target, second.id);
    assert.equal(edges[0]?.sourceHandle, "next");
    assert.equal(edges[0]?.targetHandle, "in");
    assert.match(edges[0]?.id ?? "", /^edge-/);
  });

  it("anchors the copied group to an explicit origin position", () => {
    const payload: ClipboardPayload = {
      nodes: [
        {
          id: "a",
          type: "click",
          position: { x: 10, y: 20 },
          data: { kind: "click" },
        },
      ],
      edges: [],
    };

    const { nodes } = pasteSelection(payload, { origin: { x: 100, y: 200 } });

    assert.deepEqual(nodes[0]?.position, { x: 100, y: 200 });
  });
});
