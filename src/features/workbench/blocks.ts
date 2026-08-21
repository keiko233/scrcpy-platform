import {
  ClockIcon,
  CombineIcon,
  FlagIcon,
  GitBranchIcon,
  HandIcon,
  ListRestartIcon,
  MousePointerClickIcon,
  PlayIcon,
  RefreshCwIcon,
  RocketIcon,
  ScanSquareIcon,
  ScanTextIcon,
  ShieldCheckIcon,
  VariableIcon,
  type LucideIcon,
} from "lucide-react";

import {
  FLOW_NODE_KINDS,
  FLOW_NODE_PORTS,
} from "../../shared/project-contracts";
import type { JsonValue } from "../../shared/project-contracts";

import type {
  AutomationBlockKind,
  FlowBlockKind,
  WorkbenchNodeData,
  FieldDefinition,
} from "./types";

function text(value: JsonValue | undefined): string {
  return value === undefined || value === null ? "" : String(value);
}

export interface BlockDefinition {
  kind: FlowBlockKind;
  label: string;
  description: string;
  icon: LucideIcon;
  defaults: WorkbenchNodeData;
  summarize: (data: WorkbenchNodeData) => string;
  fields: FieldDefinition[];
  inputPorts: readonly string[];
  outputPorts: readonly string[];
}

export const BLOCK_DEFINITIONS: Record<FlowBlockKind, BlockDefinition> = {
  start: {
    kind: "start",
    label: "Start",
    description: "Entry point of the flow. Execution begins here.",
    icon: PlayIcon,
    defaults: { kind: "start" },
    summarize: () => "Flow entry point",
    fields: [],
    inputPorts: FLOW_NODE_PORTS.start.inputs,
    outputPorts: FLOW_NODE_PORTS.start.outputs,
  },
  end: {
    kind: "end",
    label: "End",
    description: "Terminal point of the flow. Execution stops here.",
    icon: FlagIcon,
    defaults: { kind: "end" },
    summarize: () => "Flow terminal",
    fields: [],
    inputPorts: FLOW_NODE_PORTS.end.inputs,
    outputPorts: FLOW_NODE_PORTS.end.outputs,
  },
  click: {
    kind: "click",
    label: "Click",
    description: "Tap a coordinate on the target display.",
    icon: MousePointerClickIcon,
    defaults: { kind: "click", x: 500, y: 1000, description: "" },
    summarize: (data) => `(${text(data.x)}, ${text(data.y)})`,
    fields: [
      { name: "x", label: "X", kind: "number", step: 1, min: 0 },
      { name: "y", label: "Y", kind: "number", step: 1, min: 0 },
      {
        name: "description",
        label: "Notes",
        kind: "textarea",
        placeholder: "Optional description",
      },
    ],
    inputPorts: FLOW_NODE_PORTS.click.inputs,
    outputPorts: FLOW_NODE_PORTS.click.outputs,
  },
  swipe: {
    kind: "swipe",
    label: "Swipe",
    description: "Drag from one point to another on the screen.",
    icon: HandIcon,
    defaults: {
      kind: "swipe",
      fromX: 500,
      fromY: 1000,
      toX: 500,
      toY: 400,
      durationMs: 300,
    },
    summarize: (data) =>
      `(${text(data.fromX)}, ${text(data.fromY)}) -> (${text(data.toX)}, ${text(data.toY)})`,
    fields: [
      { name: "fromX", label: "From X", kind: "number", step: 1 },
      { name: "fromY", label: "From Y", kind: "number", step: 1 },
      { name: "toX", label: "To X", kind: "number", step: 1 },
      { name: "toY", label: "To Y", kind: "number", step: 1 },
      { name: "durationMs", label: "Duration (ms)", kind: "number", step: 50, min: 0 },
    ],
    inputPorts: FLOW_NODE_PORTS.swipe.inputs,
    outputPorts: FLOW_NODE_PORTS.swipe.outputs,
  },
  ocr: {
    kind: "ocr",
    label: "OCR",
    description: "Read a display region and optionally wait for matching text.",
    icon: ScanTextIcon,
    defaults: {
      kind: "ocr",
      x: 0,
      y: 0,
      width: 500,
      height: 200,
      languages: "eng+chi_sim",
      expectedText: "",
      matchMode: "contains",
      caseSensitive: false,
      timeoutMs: 5000,
      intervalMs: 500,
      failOnTimeout: true,
      textVariable: "ocrText",
      confidenceVariable: "ocrConfidence",
      matchedVariable: "ocrMatched",
    },
    summarize: (data) => `wait for: ${text(data.expectedText) || "(unset)"}`,
    fields: [
      { name: "x", label: "Region X", kind: "number", min: 0, step: 1 },
      { name: "y", label: "Region Y", kind: "number", min: 0, step: 1 },
      { name: "width", label: "Region width", kind: "number", min: 1, step: 1 },
      { name: "height", label: "Region height", kind: "number", min: 1, step: 1 },
      {
        name: "languages",
        label: "Languages",
        kind: "select",
        options: [
          { value: "eng+chi_sim", label: "English + Simplified Chinese" },
          { value: "eng", label: "English" },
          { value: "chi_sim", label: "Simplified Chinese" },
        ],
      },
      {
        name: "expectedText",
        label: "Expected text",
        kind: "textarea",
        placeholder: "Text to detect on screen",
      },
      {
        name: "matchMode",
        label: "Match mode",
        kind: "select",
        options: [
          { value: "contains", label: "Contains" },
          { value: "exact", label: "Exact" },
          { value: "regex", label: "Regular expression" },
        ],
      },
      { name: "caseSensitive", label: "Case sensitive", kind: "boolean" },
      {
        name: "timeoutMs",
        label: "Timeout (ms)",
        kind: "number",
        step: 500,
        min: 0,
      },
      {
        name: "intervalMs",
        label: "Retry interval (ms)",
        kind: "number",
        step: 100,
        min: 100,
      },
      { name: "failOnTimeout", label: "Fail on timeout", kind: "boolean" },
      {
        name: "textVariable",
        label: "Text variable",
        kind: "text",
        placeholder: "ocrText",
      },
      {
        name: "confidenceVariable",
        label: "Confidence variable",
        kind: "text",
        placeholder: "ocrConfidence",
      },
      {
        name: "matchedVariable",
        label: "Matched variable",
        kind: "text",
        placeholder: "ocrMatched",
      },
    ],
    inputPorts: FLOW_NODE_PORTS.ocr.inputs,
    outputPorts: FLOW_NODE_PORTS.ocr.outputs,
  },
  delay: {
    kind: "delay",
    label: "Delay",
    description: "Wait for a fixed amount of time.",
    icon: ClockIcon,
    defaults: { kind: "delay", ms: 1000 },
    summarize: (data) => `${text(data.ms)}ms`,
    fields: [
      { name: "ms", label: "Duration (ms)", kind: "number", step: 100, min: 0 },
    ],
    inputPorts: FLOW_NODE_PORTS.delay.inputs,
    outputPorts: FLOW_NODE_PORTS.delay.outputs,
  },
  "launch-app": {
    kind: "launch-app",
    label: "Launch app",
    description: "Start an application on the device.",
    icon: RocketIcon,
    defaults: { kind: "launch-app", packageName: "", activity: "" },
    summarize: (data) => text(data.packageName) || "(package unset)",
    fields: [
      {
        name: "packageName",
        label: "Package",
        kind: "text",
        placeholder: "com.example.app",
      },
      {
        name: "activity",
        label: "Activity",
        kind: "text",
        placeholder: ".MainActivity (optional)",
      },
    ],
    inputPorts: FLOW_NODE_PORTS["launch-app"].inputs,
    outputPorts: FLOW_NODE_PORTS["launch-app"].outputs,
  },
  "set-variable": {
    kind: "set-variable",
    label: "Set variable",
    description: "Evaluate a safe expression and store its result.",
    icon: VariableIcon,
    defaults: { kind: "set-variable", name: "value", expression: "0" },
    summarize: (data) => `${text(data.name) || "(name)"} = ${text(data.expression)}`,
    fields: [
      { name: "name", label: "Variable", kind: "text", placeholder: "count" },
      {
        name: "expression",
        label: "Expression",
        kind: "textarea",
        placeholder: "$count + 1",
      },
    ],
    inputPorts: FLOW_NODE_PORTS["set-variable"].inputs,
    outputPorts: FLOW_NODE_PORTS["set-variable"].outputs,
  },
  if: {
    kind: "if",
    label: "If",
    description: "Route execution through the true or false output.",
    icon: GitBranchIcon,
    defaults: { kind: "if", condition: "true" },
    summarize: (data) => text(data.condition) || "(condition unset)",
    fields: [
      {
        name: "condition",
        label: "Condition",
        kind: "textarea",
        placeholder: "$count >= 3",
      },
    ],
    inputPorts: FLOW_NODE_PORTS.if.inputs,
    outputPorts: FLOW_NODE_PORTS.if.outputs,
  },
  merge: {
    kind: "merge",
    label: "Merge",
    description: "Join two mutually exclusive branches back into one path.",
    icon: CombineIcon,
    defaults: { kind: "merge" },
    summarize: () => "a / b -> next",
    fields: [],
    inputPorts: FLOW_NODE_PORTS.merge.inputs,
    outputPorts: FLOW_NODE_PORTS.merge.outputs,
  },
  for: {
    kind: "for",
    label: "For range",
    description: "Repeat a body over a numeric range with a guarded loop-back.",
    icon: ListRestartIcon,
    defaults: {
      kind: "for",
      variable: "index",
      from: "0",
      to: "3",
      step: "1",
      maxIterations: 1000,
    },
    summarize: (data) =>
      `${text(data.variable) || "index"}: ${text(data.from)} .. ${text(data.to)}`,
    fields: [
      { name: "variable", label: "Variable", kind: "text", placeholder: "index" },
      { name: "from", label: "From expression", kind: "text", placeholder: "0" },
      { name: "to", label: "To expression (exclusive)", kind: "text", placeholder: "10" },
      { name: "step", label: "Step expression", kind: "text", placeholder: "1" },
      {
        name: "maxIterations",
        label: "Maximum iterations",
        kind: "number",
        min: 1,
        step: 1,
      },
    ],
    inputPorts: FLOW_NODE_PORTS.for.inputs,
    outputPorts: FLOW_NODE_PORTS.for.outputs,
  },
  while: {
    kind: "while",
    label: "While",
    description: "Repeat a body while a safe expression remains truthy.",
    icon: RefreshCwIcon,
    defaults: { kind: "while", condition: "false", maxIterations: 1000 },
    summarize: (data) => text(data.condition) || "(condition unset)",
    fields: [
      {
        name: "condition",
        label: "Condition",
        kind: "textarea",
        placeholder: "$ready == false",
      },
      {
        name: "maxIterations",
        label: "Maximum iterations",
        kind: "number",
        min: 1,
        step: 1,
      },
    ],
    inputPorts: FLOW_NODE_PORTS.while.inputs,
    outputPorts: FLOW_NODE_PORTS.while.outputs,
  },
  assert: {
    kind: "assert",
    label: "Assert",
    description: "Fail the run when a safe expression is not truthy.",
    icon: ShieldCheckIcon,
    defaults: { kind: "assert", condition: "true", message: "Assertion failed" },
    summarize: (data) => text(data.condition) || "(condition unset)",
    fields: [
      {
        name: "condition",
        label: "Condition",
        kind: "textarea",
        placeholder: "$result == true",
      },
      {
        name: "message",
        label: "Failure message",
        kind: "textarea",
        placeholder: "Expected result to be true",
      },
    ],
    inputPorts: FLOW_NODE_PORTS.assert.inputs,
    outputPorts: FLOW_NODE_PORTS.assert.outputs,
  },
  "screen-region": {
    kind: "screen-region",
    label: "Screen region",
    description: "Define a composite x, y, width, height region on the display.",
    icon: ScanSquareIcon,
    defaults: { kind: "screen-region", x: 0, y: 0, width: 500, height: 200 },
    summarize: (data) =>
      `(${text(data.x)}, ${text(data.y)}) ${text(data.width)}x${text(data.height)}`,
    fields: [
      { name: "x", label: "Region X", kind: "number", min: 0, step: 1 },
      { name: "y", label: "Region Y", kind: "number", min: 0, step: 1 },
      { name: "width", label: "Region width", kind: "number", min: 1, step: 1 },
      { name: "height", label: "Region height", kind: "number", min: 1, step: 1 },
    ],
    inputPorts: FLOW_NODE_PORTS["screen-region"].inputs,
    outputPorts: FLOW_NODE_PORTS["screen-region"].outputs,
  },
};

export const BLOCK_KIND_ORDER: AutomationBlockKind[] = [
  "click",
  "swipe",
  "ocr",
  "delay",
  "launch-app",
  "set-variable",
  "if",
  "merge",
  "for",
  "while",
  "assert",
  "screen-region",
];

export const FLOW_BLOCK_KIND_ORDER: FlowBlockKind[] = [
  "start",
  "end",
  ...BLOCK_KIND_ORDER,
];

export function isAutomationBlockKind(
  value: unknown,
): value is AutomationBlockKind {
  return (
    typeof value === "string" &&
    BLOCK_KIND_ORDER.includes(value as AutomationBlockKind)
  );
}

export function isFlowBlockKind(value: unknown): value is FlowBlockKind {
  return (
    typeof value === "string" &&
    (FLOW_NODE_KINDS as readonly string[]).includes(value)
  );
}
