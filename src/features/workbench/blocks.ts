import {
  ArrowRightLeftIcon,
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
  SigmaIcon,
  VariableIcon,
  type LucideIcon,
} from "lucide-react";

import { m } from "@/paraglide/messages.js";
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
    get label() {
      return m.block_start_label();
    },
    get description() {
      return m.block_start_description();
    },
    icon: PlayIcon,
    defaults: { kind: "start" },
    summarize: () => m.block_start_summarize(),
    get fields(): FieldDefinition[] {
      return [];
    },
    inputPorts: FLOW_NODE_PORTS.start.inputs,
    outputPorts: FLOW_NODE_PORTS.start.outputs,
  },
  end: {
    kind: "end",
    get label() {
      return m.block_end_label();
    },
    get description() {
      return m.block_end_description();
    },
    icon: FlagIcon,
    defaults: { kind: "end" },
    summarize: () => m.block_end_summarize(),
    get fields(): FieldDefinition[] {
      return [];
    },
    inputPorts: FLOW_NODE_PORTS.end.inputs,
    outputPorts: FLOW_NODE_PORTS.end.outputs,
  },
  click: {
    kind: "click",
    get label() {
      return m.block_click_label();
    },
    get description() {
      return m.block_click_description();
    },
    icon: MousePointerClickIcon,
    defaults: { kind: "click", x: 500, y: 1000, description: "" },
    summarize: (data) => `(${text(data.x)}, ${text(data.y)})`,
    get fields(): FieldDefinition[] {
      return [
        {
          name: "x",
          get label() {
            return m.block_field_click_x_label();
          },
          kind: "number",
          step: 1,
          min: 0,
        },
        {
          name: "y",
          get label() {
            return m.block_field_click_y_label();
          },
          kind: "number",
          step: 1,
          min: 0,
        },
        {
          name: "description",
          get label() {
            return m.block_field_click_description_label();
          },
          kind: "textarea",
          get placeholder() {
            return m.block_field_click_description_placeholder();
          },
        },
      ];
    },
    inputPorts: FLOW_NODE_PORTS.click.inputs,
    outputPorts: FLOW_NODE_PORTS.click.outputs,
  },
  swipe: {
    kind: "swipe",
    get label() {
      return m.block_swipe_label();
    },
    get description() {
      return m.block_swipe_description();
    },
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
    get fields(): FieldDefinition[] {
      return [
        {
          name: "fromX",
          get label() {
            return m.block_field_swipe_from_x_label();
          },
          kind: "number",
          step: 1,
        },
        {
          name: "fromY",
          get label() {
            return m.block_field_swipe_from_y_label();
          },
          kind: "number",
          step: 1,
        },
        {
          name: "toX",
          get label() {
            return m.block_field_swipe_to_x_label();
          },
          kind: "number",
          step: 1,
        },
        {
          name: "toY",
          get label() {
            return m.block_field_swipe_to_y_label();
          },
          kind: "number",
          step: 1,
        },
        {
          name: "durationMs",
          get label() {
            return m.block_field_swipe_duration_ms_label();
          },
          kind: "number",
          step: 50,
          min: 0,
        },
      ];
    },
    inputPorts: FLOW_NODE_PORTS.swipe.inputs,
    outputPorts: FLOW_NODE_PORTS.swipe.outputs,
  },
  ocr: {
    kind: "ocr",
    get label() {
      return m.block_ocr_label();
    },
    get description() {
      return m.block_ocr_description();
    },
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
    summarize: (data) =>
      m.block_summarize_wait_for({ text: text(data.expectedText) || m.block_summarize_unset() }),
    get fields(): FieldDefinition[] {
      return [
        {
          name: "x",
          get label() {
            return m.block_field_ocr_x_label();
          },
          kind: "number",
          min: 0,
          step: 1,
        },
        {
          name: "y",
          get label() {
            return m.block_field_ocr_y_label();
          },
          kind: "number",
          min: 0,
          step: 1,
        },
        {
          name: "width",
          get label() {
            return m.block_field_ocr_width_label();
          },
          kind: "number",
          min: 1,
          step: 1,
        },
        {
          name: "height",
          get label() {
            return m.block_field_ocr_height_label();
          },
          kind: "number",
          min: 1,
          step: 1,
        },
        {
          name: "languages",
          get label() {
            return m.block_field_ocr_languages_label();
          },
          kind: "select",
          get options() {
            return [
              {
                value: "eng+chi_sim",
                get label() {
                  return m.block_field_ocr_languages_option_eng_chi_sim();
                },
              },
              {
                value: "eng",
                get label() {
                  return m.block_field_ocr_languages_option_eng();
                },
              },
              {
                value: "chi_sim",
                get label() {
                  return m.block_field_ocr_languages_option_chi_sim();
                },
              },
            ];
          },
        },
        {
          name: "expectedText",
          get label() {
            return m.block_field_ocr_expected_text_label();
          },
          kind: "textarea",
          get placeholder() {
            return m.block_field_ocr_expected_text_placeholder();
          },
        },
        {
          name: "matchMode",
          get label() {
            return m.block_field_ocr_match_mode_label();
          },
          kind: "select",
          get options() {
            return [
              {
                value: "contains",
                get label() {
                  return m.block_field_ocr_match_mode_option_contains();
                },
              },
              {
                value: "exact",
                get label() {
                  return m.block_field_ocr_match_mode_option_exact();
                },
              },
              {
                value: "regex",
                get label() {
                  return m.block_field_ocr_match_mode_option_regex();
                },
              },
            ];
          },
        },
        {
          name: "caseSensitive",
          get label() {
            return m.block_field_ocr_case_sensitive_label();
          },
          kind: "boolean",
        },
        {
          name: "timeoutMs",
          get label() {
            return m.block_field_ocr_timeout_ms_label();
          },
          kind: "number",
          step: 500,
          min: 0,
        },
        {
          name: "intervalMs",
          get label() {
            return m.block_field_ocr_interval_ms_label();
          },
          kind: "number",
          step: 100,
          min: 100,
        },
        {
          name: "failOnTimeout",
          get label() {
            return m.block_field_ocr_fail_on_timeout_label();
          },
          kind: "boolean",
        },
        {
          name: "textVariable",
          get label() {
            return m.block_field_ocr_text_variable_label();
          },
          kind: "text",
          get placeholder() {
            return m.block_field_ocr_text_variable_placeholder();
          },
        },
        {
          name: "confidenceVariable",
          get label() {
            return m.block_field_ocr_confidence_variable_label();
          },
          kind: "text",
          get placeholder() {
            return m.block_field_ocr_confidence_variable_placeholder();
          },
        },
        {
          name: "matchedVariable",
          get label() {
            return m.block_field_ocr_matched_variable_label();
          },
          kind: "text",
          get placeholder() {
            return m.block_field_ocr_matched_variable_placeholder();
          },
        },
      ];
    },
    inputPorts: FLOW_NODE_PORTS.ocr.inputs,
    outputPorts: FLOW_NODE_PORTS.ocr.outputs,
  },
  delay: {
    kind: "delay",
    get label() {
      return m.block_delay_label();
    },
    get description() {
      return m.block_delay_description();
    },
    icon: ClockIcon,
    defaults: { kind: "delay", ms: 1000 },
    summarize: (data) => `${text(data.ms)}ms`,
    get fields(): FieldDefinition[] {
      return [
        {
          name: "ms",
          get label() {
            return m.block_field_delay_ms_label();
          },
          kind: "number",
          step: 100,
          min: 0,
        },
      ];
    },
    inputPorts: FLOW_NODE_PORTS.delay.inputs,
    outputPorts: FLOW_NODE_PORTS.delay.outputs,
  },
  "launch-app": {
    kind: "launch-app",
    get label() {
      return m.block_launch_app_label();
    },
    get description() {
      return m.block_launch_app_description();
    },
    icon: RocketIcon,
    defaults: { kind: "launch-app", packageName: "", activity: "" },
    summarize: (data) => text(data.packageName) || m.block_summarize_package_unset(),
    get fields(): FieldDefinition[] {
      return [
        {
          name: "packageName",
          get label() {
            return m.block_field_launch_app_package_name_label();
          },
          kind: "package",
          get placeholder() {
            return m.block_field_launch_app_package_name_placeholder();
          },
        },
        {
          name: "activity",
          get label() {
            return m.block_field_launch_app_activity_label();
          },
          kind: "text",
          get placeholder() {
            return m.block_field_launch_app_activity_placeholder();
          },
        },
      ];
    },
    inputPorts: FLOW_NODE_PORTS["launch-app"].inputs,
    outputPorts: FLOW_NODE_PORTS["launch-app"].outputs,
  },
  "set-variable": {
    kind: "set-variable",
    get label() {
      return m.block_set_variable_label();
    },
    get description() {
      return m.block_set_variable_description();
    },
    icon: VariableIcon,
    defaults: { kind: "set-variable", name: "value", expression: "0" },
    summarize: (data) =>
      `${text(data.name) || m.block_summarize_name_fallback()} = ${text(data.expression)}`,
    get fields(): FieldDefinition[] {
      return [
        {
          name: "name",
          get label() {
            return m.block_field_set_variable_name_label();
          },
          kind: "text",
          get placeholder() {
            return m.block_field_set_variable_name_placeholder();
          },
        },
        {
          name: "expression",
          get label() {
            return m.block_field_set_variable_expression_label();
          },
          kind: "textarea",
          get placeholder() {
            return m.block_field_set_variable_expression_placeholder();
          },
        },
      ];
    },
    inputPorts: FLOW_NODE_PORTS["set-variable"].inputs,
    outputPorts: FLOW_NODE_PORTS["set-variable"].outputs,
  },
  calculate: {
    kind: "calculate",
    get label() {
      return m.block_calculate_label();
    },
    get description() {
      return m.block_calculate_description();
    },
    icon: SigmaIcon,
    defaults: { kind: "calculate", operation: "max", values: "", variable: "result" },
    summarize: (data) =>
      `${text(data.variable) || m.block_summarize_unset()} = ${text(data.operation)}(${text(data.values)})`,
    get fields(): FieldDefinition[] {
      return [
        {
          name: "operation",
          get label() {
            return m.block_field_calculate_operation_label();
          },
          kind: "select",
          get options() {
            return [
              {
                value: "max",
                get label() {
                  return m.block_field_calculate_operation_option_max();
                },
              },
              {
                value: "min",
                get label() {
                  return m.block_field_calculate_operation_option_min();
                },
              },
              {
                value: "sum",
                get label() {
                  return m.block_field_calculate_operation_option_sum();
                },
              },
              {
                value: "avg",
                get label() {
                  return m.block_field_calculate_operation_option_avg();
                },
              },
              {
                value: "count",
                get label() {
                  return m.block_field_calculate_operation_option_count();
                },
              },
            ];
          },
        },
        {
          name: "values",
          get label() {
            return m.block_field_calculate_values_label();
          },
          kind: "textarea",
          get placeholder() {
            return m.block_field_calculate_values_placeholder();
          },
        },
        {
          name: "variable",
          get label() {
            return m.block_field_calculate_variable_label();
          },
          kind: "text",
          get placeholder() {
            return m.block_field_calculate_variable_placeholder();
          },
        },
      ];
    },
    inputPorts: FLOW_NODE_PORTS.calculate.inputs,
    outputPorts: FLOW_NODE_PORTS.calculate.outputs,
  },
  convert: {
    kind: "convert",
    label: "Convert",
    description: "Cast a connected value to number, integer, string, or boolean.",
    icon: ArrowRightLeftIcon,
    defaults: { kind: "convert", toType: "number" },
    summarize: (data) => `to ${text(data.toType)}`,
    fields: [
      {
        name: "toType",
        label: "Convert to",
        kind: "select",
        options: [
          { value: "number", label: "Number" },
          { value: "int", label: "Integer" },
          { value: "string", label: "String" },
          { value: "boolean", label: "Boolean" },
        ],
      },
    ],
    inputPorts: FLOW_NODE_PORTS.convert.inputs,
    outputPorts: FLOW_NODE_PORTS.convert.outputs,
  },
  if: {
    kind: "if",
    get label() {
      return m.block_if_label();
    },
    get description() {
      return m.block_if_description();
    },
    icon: GitBranchIcon,
    defaults: { kind: "if", condition: "true" },
    summarize: (data) => text(data.condition) || m.block_summarize_condition_unset(),
    get fields(): FieldDefinition[] {
      return [
        {
          name: "condition",
          get label() {
            return m.block_field_if_condition_label();
          },
          kind: "textarea",
          get placeholder() {
            return m.block_field_if_condition_placeholder();
          },
        },
      ];
    },
    inputPorts: FLOW_NODE_PORTS.if.inputs,
    outputPorts: FLOW_NODE_PORTS.if.outputs,
  },
  merge: {
    kind: "merge",
    get label() {
      return m.block_merge_label();
    },
    get description() {
      return m.block_merge_description();
    },
    icon: CombineIcon,
    defaults: { kind: "merge" },
    summarize: () => m.block_merge_summarize(),
    get fields(): FieldDefinition[] {
      return [];
    },
    inputPorts: FLOW_NODE_PORTS.merge.inputs,
    outputPorts: FLOW_NODE_PORTS.merge.outputs,
  },
  for: {
    kind: "for",
    get label() {
      return m.block_for_label();
    },
    get description() {
      return m.block_for_description();
    },
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
      `${text(data.variable) || m.block_summarize_index_fallback()}: ${text(data.from)} .. ${text(data.to)}`,
    get fields(): FieldDefinition[] {
      return [
        {
          name: "variable",
          get label() {
            return m.block_field_for_variable_label();
          },
          kind: "text",
          get placeholder() {
            return m.block_field_for_variable_placeholder();
          },
        },
        {
          name: "from",
          get label() {
            return m.block_field_for_from_label();
          },
          kind: "text",
          get placeholder() {
            return m.block_field_for_from_placeholder();
          },
        },
        {
          name: "to",
          get label() {
            return m.block_field_for_to_label();
          },
          kind: "text",
          get placeholder() {
            return m.block_field_for_to_placeholder();
          },
        },
        {
          name: "step",
          get label() {
            return m.block_field_for_step_label();
          },
          kind: "text",
          get placeholder() {
            return m.block_field_for_step_placeholder();
          },
        },
        {
          name: "maxIterations",
          get label() {
            return m.block_field_for_max_iterations_label();
          },
          kind: "number",
          min: 1,
          step: 1,
        },
      ];
    },
    inputPorts: FLOW_NODE_PORTS.for.inputs,
    outputPorts: FLOW_NODE_PORTS.for.outputs,
  },
  while: {
    kind: "while",
    get label() {
      return m.block_while_label();
    },
    get description() {
      return m.block_while_description();
    },
    icon: RefreshCwIcon,
    defaults: { kind: "while", condition: "false", maxIterations: 1000 },
    summarize: (data) => text(data.condition) || m.block_summarize_condition_unset(),
    get fields(): FieldDefinition[] {
      return [
        {
          name: "condition",
          get label() {
            return m.block_field_while_condition_label();
          },
          kind: "textarea",
          get placeholder() {
            return m.block_field_while_condition_placeholder();
          },
        },
        {
          name: "maxIterations",
          get label() {
            return m.block_field_while_max_iterations_label();
          },
          kind: "number",
          min: 1,
          step: 1,
        },
      ];
    },
    inputPorts: FLOW_NODE_PORTS.while.inputs,
    outputPorts: FLOW_NODE_PORTS.while.outputs,
  },
  assert: {
    kind: "assert",
    get label() {
      return m.block_assert_label();
    },
    get description() {
      return m.block_assert_description();
    },
    icon: ShieldCheckIcon,
    defaults: { kind: "assert", condition: "true", message: "Assertion failed" },
    summarize: (data) => text(data.condition) || m.block_summarize_condition_unset(),
    get fields(): FieldDefinition[] {
      return [
        {
          name: "condition",
          get label() {
            return m.block_field_assert_condition_label();
          },
          kind: "textarea",
          get placeholder() {
            return m.block_field_assert_condition_placeholder();
          },
        },
        {
          name: "message",
          get label() {
            return m.block_field_assert_message_label();
          },
          kind: "textarea",
          get placeholder() {
            return m.block_field_assert_message_placeholder();
          },
        },
      ];
    },
    inputPorts: FLOW_NODE_PORTS.assert.inputs,
    outputPorts: FLOW_NODE_PORTS.assert.outputs,
  },
  "screen-region": {
    kind: "screen-region",
    get label() {
      return m.block_screen_region_label();
    },
    get description() {
      return m.block_screen_region_description();
    },
    icon: ScanSquareIcon,
    defaults: { kind: "screen-region", x: 0, y: 0, width: 500, height: 200 },
    summarize: (data) =>
      `(${text(data.x)}, ${text(data.y)}) ${text(data.width)}x${text(data.height)}`,
    get fields(): FieldDefinition[] {
      return [
        {
          name: "x",
          get label() {
            return m.block_field_screen_region_x_label();
          },
          kind: "number",
          min: 0,
          step: 1,
        },
        {
          name: "y",
          get label() {
            return m.block_field_screen_region_y_label();
          },
          kind: "number",
          min: 0,
          step: 1,
        },
        {
          name: "width",
          get label() {
            return m.block_field_screen_region_width_label();
          },
          kind: "number",
          min: 1,
          step: 1,
        },
        {
          name: "height",
          get label() {
            return m.block_field_screen_region_height_label();
          },
          kind: "number",
          min: 1,
          step: 1,
        },
      ];
    },
    inputPorts: FLOW_NODE_PORTS["screen-region"].inputs,
    outputPorts: FLOW_NODE_PORTS["screen-region"].outputs,
  },
};

export const BLOCK_KIND_ORDER: AutomationBlockKind[] = [
  "click",
  "swipe",
  "screen-region",
  "ocr",
  "delay",
  "launch-app",
  "set-variable",
  "calculate",
  "convert",
  "if",
  "merge",
  "for",
  "while",
  "assert",
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
