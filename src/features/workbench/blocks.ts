import {
  ArrowRightLeftIcon,
  BoxSelectIcon,
  ClockIcon,
  CombineIcon,
  DatabaseIcon,
  EqualIcon,
  FlagIcon,
  GitBranchIcon,
  HandIcon,
  ListRestartIcon,
  LogInIcon,
  LogOutIcon,
  MousePointerClickIcon,
  PlayIcon,
  PuzzleIcon,
  RefreshCwIcon,
  Repeat2Icon,
  ScanSquareIcon,
  ScanTextIcon,
  ScaleIcon,
  ShieldCheckIcon,
  SigmaIcon,
  SmartphoneIcon,
  SplitIcon,
  StickyNoteIcon,
  TagIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react";

import { m } from "@/paraglide/messages.js";
import {
  FLOW_NODE_KINDS,
  FLOW_NODE_PORTS,
  flowDynamicPortId,
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

function resultNames(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }
  const names: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      continue;
    }
    const name = text((entry as Record<string, JsonValue>).name);
    if (name.length > 0) {
      names.push(name);
    }
  }
  return names.join(", ");
}

function paramNames(value: unknown): string {
  return resultNames(value);
}

function calculateInputSummary(data: WorkbenchNodeData): string {
  const count =
    typeof data.inputCount === "number" && Number.isInteger(data.inputCount)
      ? Math.max(1, data.inputCount)
      : 2;
  const shown = Math.min(count, 6);
  const ids = Array.from({ length: shown }, (_, index) =>
    flowDynamicPortId(index),
  );
  return count > shown ? `${ids.join(", ")}, …` : ids.join(", ");
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
      charSet: "any",
      expectedText: "",
      matchMode: "contains",
      caseSensitive: false,
      timeoutMs: 5000,
      intervalMs: 500,
      failOnTimeout: true,
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
          name: "charSet",
          get label() {
            return m.block_field_ocr_char_set_label();
          },
          kind: "select",
          get options() {
            return [
              {
                value: "any",
                get label() {
                  return m.block_field_ocr_char_set_option_any();
                },
              },
              {
                value: "digits",
                get label() {
                  return m.block_field_ocr_char_set_option_digits();
                },
              },
              {
                value: "number",
                get label() {
                  return m.block_field_ocr_char_set_option_number();
                },
              },
              {
                value: "letters",
                get label() {
                  return m.block_field_ocr_char_set_option_letters();
                },
              },
              {
                value: "alphanumeric",
                get label() {
                  return m.block_field_ocr_char_set_option_alphanumeric();
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
  calculate: {
    kind: "calculate",
    get label() {
      return m.block_calculate_label();
    },
    get description() {
      return m.block_calculate_description();
    },
    icon: SigmaIcon,
    defaults: {
      kind: "calculate",
      operation: "max",
      inputCount: 2,
      expression: "a + b",
    },
    summarize: (data) => {
      if (data.operation === "expression") {
        return text(data.expression) || m.block_summarize_unset();
      }
      return `${text(data.operation)}(${calculateInputSummary(data)})`;
    },
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
              {
                value: "expression",
                get label() {
                  return m.block_field_calculate_operation_option_expression();
                },
              },
            ];
          },
        },
        {
          name: "expression",
          get label() {
            return m.block_field_calculate_expression_label();
          },
          kind: "textarea",
          get placeholder() {
            return m.block_field_calculate_expression_placeholder();
          },
          visible: (data) => data.operation === "expression",
        },
      ];
    },
    inputPorts: FLOW_NODE_PORTS.calculate.inputs,
    outputPorts: FLOW_NODE_PORTS.calculate.outputs,
  },
  convert: {
    kind: "convert",
    get label() {
      return m.block_convert_label();
    },
    get description() {
      return m.block_convert_description();
    },
    icon: ArrowRightLeftIcon,
    defaults: { kind: "convert", toType: "number" },
    summarize: (data) => m.block_convert_summarize({ target: text(data.toType) }),
    get fields(): FieldDefinition[] {
      return [
        {
          name: "toType",
          get label() {
            return m.block_field_convert_to_type_label();
          },
          kind: "select",
          get options() {
            return [
              {
                value: "number",
                get label() {
                  return m.block_field_convert_to_type_option_number();
                },
              },
              {
                value: "int",
                get label() {
                  return m.block_field_convert_to_type_option_int();
                },
              },
              {
                value: "string",
                get label() {
                  return m.block_field_convert_to_type_option_string();
                },
              },
              {
                value: "boolean",
                get label() {
                  return m.block_field_convert_to_type_option_boolean();
                },
              },
            ];
          },
        },
      ];
    },
    inputPorts: FLOW_NODE_PORTS.convert.inputs,
    outputPorts: FLOW_NODE_PORTS.convert.outputs,
  },
  compare: {
    kind: "compare",
    get label() {
      return m.block_compare_label();
    },
    get description() {
      return m.block_compare_description();
    },
    icon: ScaleIcon,
    defaults: { kind: "compare", operator: ">" },
    summarize: (data) => text(data.operator) || ">",
    get fields(): FieldDefinition[] {
      return [
        {
          name: "operator",
          get label() {
            return m.block_field_compare_operator_label();
          },
          kind: "select",
          get options() {
            return [
              { value: ">", get label() { return m.block_field_compare_operator_option_gt(); } },
              { value: ">=", get label() { return m.block_field_compare_operator_option_gte(); } },
              { value: "<", get label() { return m.block_field_compare_operator_option_lt(); } },
              { value: "<=", get label() { return m.block_field_compare_operator_option_lte(); } },
              { value: "==", get label() { return m.block_field_compare_operator_option_eq(); } },
              { value: "!=", get label() { return m.block_field_compare_operator_option_neq(); } },
              { value: "contains", get label() { return m.block_field_compare_operator_option_contains(); } },
              { value: "notContains", get label() { return m.block_field_compare_operator_option_not_contains(); } },
            ];
          },
        },
      ];
    },
    inputPorts: FLOW_NODE_PORTS.compare.inputs,
    outputPorts: FLOW_NODE_PORTS.compare.outputs,
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
    defaults: { kind: "if" },
    summarize: () => m.block_summarize_wired_condition(),
    get fields(): FieldDefinition[] {
      return [];
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
    defaults: { kind: "merge", inputCount: 2 },
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
      from: 0,
      to: 3,
      step: 1,
      maxIterations: 1000,
    },
    summarize: (data) => `${text(data.from)} .. ${text(data.to)}`,
    get fields(): FieldDefinition[] {
      return [
        {
          name: "from",
          get label() {
            return m.block_field_for_from_label();
          },
          kind: "number",
        },
        {
          name: "to",
          get label() {
            return m.block_field_for_to_label();
          },
          kind: "number",
        },
        {
          name: "step",
          get label() {
            return m.block_field_for_step_label();
          },
          kind: "number",
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
    defaults: { kind: "while", maxIterations: 1000 },
    summarize: () => m.block_summarize_wired_condition(),
    get fields(): FieldDefinition[] {
      return [
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
  "repeat-until": {
    kind: "repeat-until",
    get label() {
      return m.block_repeat_until_label();
    },
    get description() {
      return m.block_repeat_until_description();
    },
    icon: Repeat2Icon,
    defaults: { kind: "repeat-until", maxIterations: 1000 },
    summarize: () => m.block_summarize_repeat_until(),
    get fields(): FieldDefinition[] {
      return [
        {
          name: "maxIterations",
          get label() {
            return m.block_field_repeat_until_max_iterations_label();
          },
          kind: "number",
          min: 1,
          step: 1,
        },
      ];
    },
    inputPorts: FLOW_NODE_PORTS["repeat-until"].inputs,
    outputPorts: FLOW_NODE_PORTS["repeat-until"].outputs,
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
    defaults: { kind: "assert", message: "Assertion failed" },
    summarize: () => m.block_summarize_wired_condition(),
    get fields(): FieldDefinition[] {
      return [
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
  constant: {
    kind: "constant",
    get label() {
      return m.block_constant_label();
    },
    get description() {
      return m.block_constant_description();
    },
    icon: EqualIcon,
    defaults: { kind: "constant", type: "number", numberValue: 0 },
    summarize: (data) => {
      if (data.type === "boolean") {
        return data.booleanValue === true ? "true" : "false";
      }
      if (data.type === "string") {
        return text(data.stringValue);
      }
      return text(data.numberValue);
    },
    get fields(): FieldDefinition[] {
      return [
        {
          name: "type",
          get label() {
            return m.block_field_constant_type_label();
          },
          kind: "select",
          get options() {
            return [
              {
                value: "number",
                get label() {
                  return m.block_field_constant_type_option_number();
                },
              },
              {
                value: "string",
                get label() {
                  return m.block_field_constant_type_option_string();
                },
              },
              {
                value: "boolean",
                get label() {
                  return m.block_field_constant_type_option_boolean();
                },
              },
            ];
          },
        },
        {
          name: "numberValue",
          get label() {
            return m.block_field_constant_value_label();
          },
          kind: "number",
          visible: (data) => data.type === "number",
        },
        {
          name: "stringValue",
          get label() {
            return m.block_field_constant_value_label();
          },
          kind: "text",
          get placeholder() {
            return m.block_field_constant_value_placeholder();
          },
          visible: (data) => data.type === "string",
        },
        {
          name: "booleanValue",
          get label() {
            return m.block_field_constant_value_label();
          },
          kind: "boolean",
          visible: (data) => data.type === "boolean",
        },
      ];
    },
    inputPorts: FLOW_NODE_PORTS.constant.inputs,
    outputPorts: FLOW_NODE_PORTS.constant.outputs,
  },
  note: {
    kind: "note",
    get label() {
      return m.block_note_label();
    },
    get description() {
      return m.block_note_description();
    },
    icon: StickyNoteIcon,
    defaults: { kind: "note", note: "" },
    summarize: (data) =>
      text(data.note) || m.block_summarize_unset(),
    get fields(): FieldDefinition[] {
      return [
        {
          name: "note",
          get label() {
            return m.block_field_note_label();
          },
          kind: "textarea",
          get placeholder() {
            return m.block_field_note_placeholder();
          },
        },
      ];
    },
    inputPorts: FLOW_NODE_PORTS.note.inputs,
    outputPorts: FLOW_NODE_PORTS.note.outputs,
  },
  group: {
    kind: "group",
    get label() {
      return m.block_group_label();
    },
    get description() {
      return m.block_group_description();
    },
    icon: BoxSelectIcon,
    defaults: { kind: "group", name: "" },
    summarize: () => "",
    get fields(): FieldDefinition[] {
      return [];
    },
    inputPorts: FLOW_NODE_PORTS.group.inputs,
    outputPorts: FLOW_NODE_PORTS.group.outputs,
  },
  input: {
    kind: "input",
    get label() {
      return m.block_input_label();
    },
    get description() {
      return m.block_input_description();
    },
    icon: LogInIcon,
    defaults: {
      kind: "input",
      params: [{ name: "param", dataType: "any" }],
    },
    summarize: (data) => paramNames(data.params) || m.block_summarize_unset(),
    get fields(): FieldDefinition[] {
      return [
        {
          name: "params",
          get label() {
            return m.block_field_params_label();
          },
          kind: "param-list",
        },
      ];
    },
    inputPorts: FLOW_NODE_PORTS.input.inputs,
    outputPorts: FLOW_NODE_PORTS.input.outputs,
  },
  output: {
    kind: "output",
    get label() {
      return m.block_output_label();
    },
    get description() {
      return m.block_output_description();
    },
    icon: LogOutIcon,
    defaults: {
      kind: "output",
      results: [{ name: "result", dataType: "any" }],
    },
    summarize: (data) => resultNames(data.results),
    get fields(): FieldDefinition[] {
      return [
        {
          name: "results",
          get label() {
            return m.block_field_results_label();
          },
          kind: "result-list",
        },
      ];
    },
    inputPorts: FLOW_NODE_PORTS.output.inputs,
    outputPorts: FLOW_NODE_PORTS.output.outputs,
  },
  call: {
    kind: "call",
    get label() {
      return m.block_call_label();
    },
    get description() {
      return m.block_call_description();
    },
    icon: PuzzleIcon,
    defaults: { kind: "call", targetScriptId: "" },
    summarize: (data) => text(data.targetScriptId),
    get fields(): FieldDefinition[] {
      return [
        {
          name: "targetScriptId",
          get label() {
            return m.block_field_call_target_label();
          },
          kind: "call-target",
        },
      ];
    },
    inputPorts: FLOW_NODE_PORTS.call.inputs,
    outputPorts: FLOW_NODE_PORTS.call.outputs,
  },
};

export const BLOCK_KIND_ORDER: AutomationBlockKind[] = [
  "click",
  "swipe",
  "screen-region",
  "ocr",
  "delay",
  "constant",
  "calculate",
  "convert",
  "compare",
  "if",
  "merge",
  "for",
  "while",
  "repeat-until",
  "assert",
  "input",
  "output",
  "call",
  "note",
  "group",
];

export const FLOW_BLOCK_KIND_ORDER: FlowBlockKind[] = [
  "start",
  "end",
  ...BLOCK_KIND_ORDER,
];

export type BlockCategoryId =
  | "flow"
  | "device"
  | "logic"
  | "data"
  | "interface"
  | "annotation";

export interface BlockCategoryDefinition {
  id: BlockCategoryId;
  get label(): string;
  icon: LucideIcon;
  kinds: readonly FlowBlockKind[];
}

export const BLOCK_CATEGORIES: readonly BlockCategoryDefinition[] = [
  {
    id: "flow",
    get label() {
      return m.block_category_flow_label();
    },
    icon: WorkflowIcon,
    kinds: ["start", "end"],
  },
  {
    id: "device",
    get label() {
      return m.block_category_device_label();
    },
    icon: SmartphoneIcon,
    kinds: ["click", "swipe", "screen-region", "ocr", "delay"],
  },
  {
    id: "logic",
    get label() {
      return m.block_category_logic_label();
    },
    icon: SplitIcon,
    kinds: ["if", "merge", "for", "while", "repeat-until", "assert"],
  },
  {
    id: "data",
    get label() {
      return m.block_category_data_label();
    },
    icon: DatabaseIcon,
    kinds: ["constant", "calculate", "convert", "compare"],
  },
  {
    id: "interface",
    get label() {
      return m.block_category_interface_label();
    },
    icon: PuzzleIcon,
    kinds: ["input", "output", "call"],
  },
  {
    id: "annotation",
    get label() {
      return m.block_category_annotation_label();
    },
    icon: TagIcon,
    kinds: ["note", "group"],
  },
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
