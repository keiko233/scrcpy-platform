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

interface FieldDefinitionBase {
  name: string;
  label: string;
}

export type FieldDefinition = FieldDefinitionBase &
  (
    | {
        kind: "text";
        placeholder?: string;
      }
    | {
        kind: "textarea";
        placeholder?: string;
      }
    | {
        kind: "number";
        placeholder?: string;
        min?: number;
        step?: number;
      }
    | {
        kind: "select";
        options: ReadonlyArray<{ value: string; label: string }>;
      }
    | {
        kind: "boolean";
      }
    | {
        kind: "package";
        placeholder?: string;
      }
  );
