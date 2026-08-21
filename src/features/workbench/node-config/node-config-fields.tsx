import type { ReactNode } from "react";

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
  FLOW_DATA_TYPE_LABELS,
  type FlowDataType,
  type JsonValue,
} from "@/shared/project-contracts";

import type { FieldDefinition } from "../types";
import { PackageField } from "./package-picker";

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
      {FLOW_DATA_TYPE_LABELS[type]}
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
            connected
          </Badge>
        )}
      </div>
      {field.kind === "textarea" ? (
        <Textarea
          rows={2}
          placeholder={field.placeholder}
          value={String(value ?? "")}
          disabled={connected}
          onChange={(event) => onChange(event.target.value)}
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
        <Input
          placeholder={field.placeholder}
          value={String(value ?? "")}
          disabled={connected}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}
