import { useEffect, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  type FlowDataType,
  type JsonValue,
} from "@/shared/project-contracts";

import type { FieldDefinition } from "../types";
import { PackageField } from "./package-picker";
import { m } from "@/paraglide/messages.js";

export function NumberInput({
  value,
  onChange,
  placeholder,
  min,
  step,
  disabled,
}: {
  value: unknown;
  onChange: (value: number | null) => void;
  placeholder?: string;
  min?: number;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <Input
      type="number"
      min={min}
      step={step}
      disabled={disabled}
      placeholder={placeholder}
      defaultValue={value === undefined || value === null ? "" : String(value)}
      key={`number-${String(value)}`}
      onBlur={(event) => {
        const next = event.currentTarget.value;
        if (next.trim() === "") {
          onChange(null);
          return;
        }
        const parsed = Number(next);
        if (Number.isFinite(parsed)) {
          onChange(parsed);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function getDataTypeLabel(type: FlowDataType): string {
  switch (type) {
    case "any":
      return m.data_type_any();
    case "string":
      return m.data_type_string();
    case "number":
      return m.data_type_number();
    case "boolean":
      return m.data_type_boolean();
    case "screen-region":
      return m.data_type_screen_region();
    default:
      return type;
  }
}

export function DataTypeBadge({ type }: { type: FlowDataType }) {
  return (
    <span
      className={cn(
        "rounded px-1 py-px text-[8px] font-medium uppercase leading-none",
        type === "any" && "bg-zinc-500/12 text-zinc-500",
        type === "string" && "bg-emerald-500/12 text-emerald-600",
        type === "number" && "bg-sky-500/12 text-sky-600",
        type === "boolean" && "bg-violet-500/12 text-violet-600",
        type === "screen-region" && "bg-amber-500/12 text-amber-600",
      )}
    >
      {getDataTypeLabel(type)}
    </span>
  );
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border p-2">
      <div>
        <div className="text-[11px] font-medium">{title}</div>
        {description !== undefined && (
          <div className="text-[10px] text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

function useLiveTextValue(externalValue: string) {
  const [localValue, setLocalValue] = useState(externalValue);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) {
      setLocalValue(externalValue);
    }
  }, [externalValue, focused]);
  return {
    value: localValue,
    setValue: setLocalValue,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  };
}

function LiveTextInput({
  value,
  onChange,
  placeholder,
  disabled,
  multiline = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  multiline?: boolean;
}) {
  const live = useLiveTextValue(value);
  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    live.setValue(event.target.value);
    onChange(event.target.value);
  };
  if (multiline) {
    return (
      <Textarea
        rows={2}
        placeholder={placeholder}
        value={live.value}
        disabled={disabled}
        onFocus={live.onFocus}
        onBlur={live.onBlur}
        onChange={handleChange}
      />
    );
  }
  return (
    <Input
      placeholder={placeholder}
      value={live.value}
      disabled={disabled}
      onFocus={live.onFocus}
      onBlur={live.onBlur}
      onChange={handleChange}
    />
  );
}

export function FieldEditor({
  field,
  value,
  onChange,
  dataType,
  connected = false,
  active = false,
}: {
  field: FieldDefinition;
  value: JsonValue | undefined;
  onChange: (value: JsonValue) => void;
  dataType?: FlowDataType;
  connected?: boolean;
  active?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Label className="text-[11px] text-muted-foreground">
          {field.label}
        </Label>
        {dataType && <DataTypeBadge type={dataType} />}
        {connected && (
          <Badge size="sm" variant="secondary" className="ml-auto">
            {m.node_config_connected()}
          </Badge>
        )}
      </div>
      {field.kind === "textarea" ? (
        <LiveTextInput
          multiline
          placeholder={field.placeholder}
          value={String(value ?? "")}
          disabled={connected}
          onChange={onChange}
        />
      ) : field.kind === "number" ? (
        <NumberInput
          value={value}
          min={field.min}
          step={field.step}
          placeholder={field.placeholder}
          disabled={connected}
          onChange={onChange}
        />
      ) : field.kind === "select" ? (
        <Select
          disabled={connected}
          value={String(value ?? field.options[0]?.value ?? "")}
          onValueChange={(next) => {
            if (next !== null) onChange(next);
          }}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.kind === "boolean" ? (
        <Switch
          checked={value === true}
          disabled={connected}
          onCheckedChange={onChange}
          aria-label={field.label}
        />
      ) : field.kind === "package" ? (
        <PackageField
          value={value}
          placeholder={field.placeholder}
          disabled={connected}
          active={active}
          onChange={onChange}
        />
      ) : (
        <LiveTextInput
          placeholder={field.placeholder}
          value={String(value ?? "")}
          disabled={connected}
          onChange={onChange}
        />
      )}
    </div>
  );
}
