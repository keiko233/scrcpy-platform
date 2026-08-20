import {
  ClockIcon,
  HandIcon,
  MousePointerClickIcon,
  RocketIcon,
  ScanTextIcon,
  type LucideIcon,
} from "lucide-react";

import type { JsonValue } from "@/shared/project-contracts";

import type {
  AutomationBlockKind,
  AutomationData,
  FieldDefinition,
} from "./types";

function text(value: JsonValue | undefined): string {
  return value === undefined || value === null ? "" : String(value);
}

export interface BlockDefinition {
  kind: AutomationBlockKind;
  label: string;
  description: string;
  icon: LucideIcon;
  defaults: AutomationData;
  summarize: (data: AutomationData) => string;
  fields: FieldDefinition[];
}

export const BLOCK_DEFINITIONS: Record<AutomationBlockKind, BlockDefinition> = {
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
  },
  ocr: {
    kind: "ocr",
    label: "OCR",
    description: "Read the screen and wait for matching text.",
    icon: ScanTextIcon,
    defaults: { kind: "ocr", expectedText: "", timeoutMs: 5000 },
    summarize: (data) => `wait for: ${text(data.expectedText) || "(unset)"}`,
    fields: [
      {
        name: "expectedText",
        label: "Expected text",
        kind: "textarea",
        placeholder: "Text to detect on screen",
      },
      {
        name: "timeoutMs",
        label: "Timeout (ms)",
        kind: "number",
        step: 500,
        min: 0,
      },
    ],
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
  },
};

export const BLOCK_KIND_ORDER: AutomationBlockKind[] = [
  "click",
  "swipe",
  "ocr",
  "delay",
  "launch-app",
];

export function isAutomationBlockKind(
  value: unknown,
): value is AutomationBlockKind {
  return (
    typeof value === "string" &&
    BLOCK_KIND_ORDER.includes(value as AutomationBlockKind)
  );
}
