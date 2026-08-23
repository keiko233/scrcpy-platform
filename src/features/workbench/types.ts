import type { Edge, Node } from "@xyflow/react";
import type {
  FlowDataType,
  FlowNodeKind,
  JsonValue,
} from "@/shared/project-contracts";

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

/**
 * JSON-safe payload stored on an Input (parameter) boundary node. An input
 * node can declare several parameters; each parameter becomes a data output
 * port consumed by the blocks that use it.
 * Intersections (instead of interface extension) keep optional and
 * array-valued members compatible with the open JSON index signature.
 */
export type InputData = Record<string, JsonValue> & {
  kind: "input";
  params: ParamDeclaration[];
};

/** A single parameter declared on an Input node. */
export interface ParamDeclaration {
  name: string;
  dataType: FlowDataType;
  defaultValue?: JsonValue;
}

/** A single named result declared on an Output node. */
export interface ResultDeclaration {
  name: string;
  dataType: FlowDataType;
}

/** JSON-safe payload stored on an Output (result) boundary node. */
export type OutputData = Record<string, JsonValue> & {
  kind: "output";
  results: ResultDeclaration[];
};

/** JSON-safe payload stored on a Call node. */
export type CallData = Record<string, JsonValue> & {
  kind: "call";
  targetScriptId: string;
};

export type WorkbenchNodeData =
  | AutomationData
  | StartData
  | EndData
  | InputData
  | OutputData
  | CallData;

export type WorkbenchNode = Node<WorkbenchNodeData, FlowBlockKind>;
export type WorkbenchEdge = Edge<Record<string, unknown>>;

interface FieldDefinitionBase {
  name: string;
  label: string;
  visible?: (data: WorkbenchNodeData) => boolean;
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
    /** Picks the target script for a Call node from the current project. */
    | { kind: "call-target" }
    /** Edits the declared results of an Output node. */
    | { kind: "result-list" }
    /** Edits the declared parameters of an Input node. */
    | { kind: "param-list" }
    /** Edits the default value of an Input node based on its data type. */
    | { kind: "default-value" }
  );
