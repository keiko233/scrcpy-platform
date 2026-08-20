import type { Edge, Node } from "@xyflow/react";
import type { JsonValue } from "@/shared/project-contracts";

export type AutomationBlockKind =
  | "click"
  | "swipe"
  | "ocr"
  | "delay"
  | "launch-app";

/** JSON-safe payload stored on every automation block. */
export interface AutomationData extends Record<string, JsonValue> {
  kind: AutomationBlockKind;
}

export type WorkbenchNode = Node<AutomationData, AutomationBlockKind>;
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
    };
