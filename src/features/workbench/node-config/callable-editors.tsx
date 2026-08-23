import { PlusIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  FLOW_DATA_TYPES,
  FLOW_DATA_TYPE_LABELS,
  isFlowDataType,
  type FlowDataType,
  type JsonValue,
  type ScreenRegion,
} from "@/shared/project-contracts";

import { useWorkbench } from "../use-workbench";
import type { ParamDeclaration, ResultDeclaration } from "../types";
import { NumberInput } from "./node-config-fields";
import { m } from "@/paraglide/messages.js";

const DATA_TYPE_OPTIONS = FLOW_DATA_TYPES.map((dataType) => ({
  value: dataType,
  get label() {
    return FLOW_DATA_TYPE_LABELS[dataType];
  },
}));

function DataTypeSelect({
  value,
  onChange,
}: {
  value: FlowDataType;
  onChange: (next: FlowDataType) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next !== null) {
          onChange(next as FlowDataType);
        }
      }}
    >
      <SelectTrigger size="sm" className="w-full min-w-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {DATA_TYPE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Picks the call target among the other scripts of the current project. */
export function CallTargetEditor({
  value,
  onChange,
}: {
  value: JsonValue | undefined;
  onChange: (value: JsonValue) => void;
}) {
  const { library } = useWorkbench();
  const currentScriptId = library.selectedScript?.id ?? null;
  const candidates = library.scripts.filter(
    (script) => script.id !== currentScriptId,
  );
  const selectedId = typeof value === "string" ? value : "";
  const selected = candidates.find((script) => script.id === selectedId);
  return (
    <Select
      value={selected === undefined ? "" : selected.id}
      onValueChange={(next) => {
        onChange(next);
      }}
    >
      <SelectTrigger size="sm" className="w-full">
        <SelectValue placeholder={m.block_field_call_target_placeholder()} />
      </SelectTrigger>
      <SelectContent>
        {candidates.length === 0 && (
          <div className="px-2 py-1.5 text-[10px] text-muted-foreground">
            {m.block_field_call_target_empty()}
          </div>
        )}
        {candidates.map((script) => (
          <SelectItem key={script.id} value={script.id}>
            {script.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function uniqueName(existing: readonly ResultDeclaration[]): string {
  const taken = new Set(existing.map((entry) => entry.name));
  if (!taken.has("result")) {
    return "result";
  }
  for (let index = 2; ; index += 1) {
    const candidate = `result${index}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}

function uniqueParamName(existing: readonly ParamDeclaration[]): string {
  const taken = new Set(existing.map((entry) => entry.name));
  if (!taken.has("param")) {
    return "param";
  }
  for (let index = 2; ; index += 1) {
    const candidate = `param${index}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}

/** Edits the declared parameters of an Input node. */
export function ParamListEditor({
  value,
  onChange,
}: {
  value: JsonValue | undefined;
  onChange: (value: JsonValue) => void;
}) {
  const rows: ParamDeclaration[] = [];
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (
        typeof entry === "object" &&
        entry !== null &&
        !Array.isArray(entry) &&
        typeof entry.name === "string" &&
        isFlowDataType(entry.dataType)
      ) {
        rows.push({ name: entry.name, dataType: entry.dataType });
        if (
          entry.defaultValue !== undefined &&
          entry.defaultValue !== null
        ) {
          rows[rows.length - 1] = {
            ...rows[rows.length - 1]!,
            defaultValue: entry.defaultValue,
          };
        }
      }
    }
  }
  const toPayload = (next: readonly ParamDeclaration[]): JsonValue[] =>
    next.map((entry) => ({
      name: entry.name,
      dataType: entry.dataType,
      ...(entry.defaultValue !== undefined && entry.defaultValue !== null
        ? { defaultValue: entry.defaultValue }
        : {}),
    }));
  const update = (next: ParamDeclaration[]) => {
    onChange(toPayload(next));
  };
  return (
    <div className="flex flex-col gap-2">
      {rows.length === 0 && (
        <p className="text-[10px] text-muted-foreground">
          {m.block_field_params_empty()}
        </p>
      )}
      {rows.map((row, index) => (
        <div key={`${row.name}:${index}`} className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <Input
              className="h-7 min-w-0 flex-1 text-xs"
              value={row.name}
              aria-label={m.block_field_param_name_label()}
              onChange={(event) => {
                const next = [...rows];
                next[index] = { ...row, name: event.target.value };
                update(next);
              }}
            />
            <div className="w-28 shrink-0">
              <DataTypeSelect
                value={row.dataType}
                onChange={(dataType) => {
                  const next = [...rows];
                  next[index] = { ...row, dataType };
                  update(next);
                }}
              />
            </div>
            <Button
              size="icon-xs"
              variant="outline"
              aria-label={m.block_field_param_remove_aria()}
              onClick={() => update(rows.filter((_, i) => i !== index))}
            >
              <XIcon />
            </Button>
          </div>
          <div className="flex items-center gap-1.5 pl-0.5">
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {m.block_field_default_value_label()}
            </span>
            <div className="min-w-0 flex-1">
              <CompactDefaultValue
                dataType={row.dataType}
                value={row.defaultValue}
                onChange={(defaultValue) => {
                  const next = [...rows];
                  next[index] = { ...row, defaultValue };
                  update(next);
                }}
              />
            </div>
          </div>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          update([...rows, { name: uniqueParamName(rows), dataType: "any" }])
        }
      >
        <PlusIcon />
        {m.block_field_param_add()}
      </Button>
    </div>
  );
}

/** Compact fallback-value editor used per parameter row. */
function CompactDefaultValue({
  dataType,
  value,
  onChange,
}: {
  dataType: FlowDataType;
  value: JsonValue | undefined;
  onChange: (value: JsonValue | null) => void;
}) {
  if (dataType === "boolean") {
    return (
      <div className="flex items-center gap-1.5">
        <Switch
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked)}
          aria-label={m.block_field_default_value_label()}
        />
        <span className="text-[10px] text-muted-foreground">
          {value === true ? "true" : "false"}
        </span>
      </div>
    );
  }
  if (dataType === "screen-region") {
    return (
      <RegionValueEditor value={parseRegion(value)} onChange={onChange} />
    );
  }
  if (dataType === "number") {
    return (
      <NumberInput
        value={value}
        onChange={(next) => onChange(next === null ? null : next)}
      />
    );
  }
  return (
    <Input
      className="h-7 text-xs"
      value={value === undefined || value === null ? "" : String(value)}
      placeholder={m.block_field_default_value_label()}
      onBlur={(event) => {
        const text = event.currentTarget.value;
        if (text.trim() === "") {
          onChange(null);
          return;
        }
        if (dataType === "any") {
          try {
            onChange(JSON.parse(text) as JsonValue);
            return;
          } catch {
            // Fall through: keep it as a plain string.
          }
        }
        onChange(text);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
    />
  );
}

/** Edits the declared results of an Output node. */
export function ResultListEditor({
  value,
  onChange,
}: {
  value: JsonValue | undefined;
  onChange: (value: JsonValue) => void;
}) {
  const rows: ResultDeclaration[] = [];
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (
        typeof entry === "object" &&
        entry !== null &&
        !Array.isArray(entry) &&
        typeof entry.name === "string" &&
        isFlowDataType(entry.dataType)
      ) {
        rows.push({ name: entry.name, dataType: entry.dataType });
      }
    }
  }
  const toPayload = (next: readonly ResultDeclaration[]): JsonValue[] =>
    next.map((entry) => ({ name: entry.name, dataType: entry.dataType }));
  const update = (next: ResultDeclaration[]) => {
    onChange(toPayload(next));
  };
  return (
    <div className="flex flex-col gap-1.5">
      {rows.length === 0 && (
        <p className="text-[10px] text-muted-foreground">
          {m.block_field_results_empty()}
        </p>
      )}
      {rows.map((row, index) => (
        <div key={`${row.name}:${index}`} className="flex items-center gap-1">
          <Input
            className="h-7 flex-1 text-xs"
            value={row.name}
            aria-label={m.block_field_result_name_label()}
            onChange={(event) => {
              const next = [...rows];
              next[index] = { ...row, name: event.target.value };
              update(next);
            }}
          />
          <div className="w-24">
            <DataTypeSelect
              value={row.dataType}
              onChange={(dataType) => {
                const next = [...rows];
                next[index] = { ...row, dataType };
                update(next);
              }}
            />
          </div>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={m.block_field_result_remove_aria()}
            onClick={() => update(rows.filter((_, i) => i !== index))}
          >
            <XIcon />
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          update([...rows, { name: uniqueName(rows), dataType: "any" }])
        }
      >
        <PlusIcon />
        {m.block_field_result_add()}
      </Button>
    </div>
  );
}

const EMPTY_REGION: ScreenRegion = { x: 0, y: 0, width: 0, height: 0 };

function parseRegion(value: JsonValue | undefined): ScreenRegion {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    typeof value.width === "number" &&
    typeof value.height === "number"
  ) {
    return { x: value.x, y: value.y, width: value.width, height: value.height };
  }
  return { ...EMPTY_REGION };
}
export function DefaultValueEditor({
  dataType,
  value,
  onChange,
}: {
  dataType: FlowDataType;
  value: JsonValue | undefined;
  onChange: (value: JsonValue) => void;
}) {
  const label = m.block_field_default_value_label();
  const clear = () => onChange(null);
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {dataType === "boolean" ? (
        <div className="flex items-center justify-between">
          <Switch
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked)}
            aria-label={label}
          />
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={m.block_field_default_value_clear_aria()}
            disabled={value === undefined || value === null}
            onClick={clear}
          >
            <XIcon />
          </Button>
        </div>
      ) : dataType === "screen-region" ? (
        <RegionValueEditor value={parseRegion(value)} onChange={onChange} />
      ) : dataType === "number" ? (
        <NumberInput
          value={value}
          onChange={(next) => onChange(next === null ? null : next)}
        />
      ) : (
        <Input
          className="h-7 text-xs"
          value={
            value === undefined || value === null ? "" : String(value)
          }
          disabled={false}
          onBlur={(event) => {
            const text = event.currentTarget.value;
            if (text.trim() === "") {
              clear();
              return;
            }
            if (dataType === "any") {
              try {
                onChange(JSON.parse(text) as JsonValue);
                return;
              } catch {
                // Fall through: keep it as a plain string.
              }
            }
            onChange(text);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
        />
      )}
    </div>
  );
}

function RegionValueEditor({
  value,
  onChange,
}: {
  value: ScreenRegion;
  onChange: (value: JsonValue) => void;
}) {
  const fields: Array<{ key: keyof ScreenRegion; label: string; min?: number }> =
    [
      { key: "x", label: "X", min: 0 },
      { key: "y", label: "Y", min: 0 },
      { key: "width", label: "W" },
      { key: "height", label: "H" },
    ];
  return (
    <div className="grid grid-cols-4 gap-1">
      {fields.map(({ key, label, min }) => (
        <div key={key} className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase text-muted-foreground">
            {label}
          </span>
          <NumberInput
            value={value[key]}
            min={min}
            step={1}
            onChange={(next) => {
              if (next === null) {
                return;
              }
              onChange({ ...value, [key]: next });
            }}
          />
        </div>
      ))}
    </div>
  );
}
