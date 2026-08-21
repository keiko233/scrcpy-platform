import type { Edge, Node } from "@xyflow/react";
import type { FlowNodeKind, JsonValue } from "@/shared/project-contracts";

export type FlowBlockKind = FlowNodeKind;

export type AutomationBlockKind = Exclude<FlowNodeKind, "start" | "end">;

/** JSON-safe payload stored on every automation block. */
export interface AutomationData extends Record<string, JsonValue> {
  kind: AutomationBlockKind;
}

/** JSON-safe payload stored on the Start node. */
export interface StartData extends Record<string, JsonValue> {
  kind: "start";
}

/** JSON-safe payload stored on the End node. */
export interface EndData extends Record<string, JsonValue> {
  kind: "end";
}

export type WorkbenchNodeData = AutomationData | StartData | EndData;

export type WorkbenchNode = Node<WorkbenchNodeData, FlowBlockKind>;
export type WorkbenchEdge = Edge<Record<string, unknown>>;

export type FieldDefinition =
  | {
      name: string;
      label: string;
      kind: "text";
      placeholder?: string;
    }
  | {
      name: string;
      label: string;
      kind: "textarea";
      placeholder?: string;
    }
  | {
      name: string;
      label: string;
      kind: "number";
      placeholder?: string;
      min?: number;
      step?: number;
    }
  | {
      name: string;
      label: string;
      kind: "select";
      options: ReadonlyArray<{ value: string; label: string }>;
    }
  | {
      name: string;
      label: string;
      kind: "boolean";
    };
