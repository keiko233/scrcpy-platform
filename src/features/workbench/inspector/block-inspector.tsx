import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
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
import { BlocksIcon, Trash2Icon } from "lucide-react";
import {
  FLOW_DATA_TYPE_LABELS,
  FLOW_NODE_DATA_PORTS,
  type FlowDataType,
  type JsonValue,
} from "@/shared/project-contracts";
import { cn } from "@/lib/utils";

import { BLOCK_DEFINITIONS } from "../blocks";
import type { FieldDefinition } from "../types";
import { useWorkbench } from "../use-workbench";

function NumberInput({
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

function FieldEditor({
  field,
  value,
  onChange,
  dataType,
  connected = false,
}: {
  field: FieldDefinition;
  value: JsonValue | undefined;
  onChange: (value: JsonValue) => void;
  dataType?: FlowDataType;
  connected?: boolean;
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

function DataTypeBadge({ type }: { type: FlowDataType }) {
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

function DataOutputs({
  outputs,
}: {
  outputs: readonly { id: string; label: string; dataType: FlowDataType }[];
}) {
  if (outputs.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-2 rounded-lg border p-2">
      <div>
        <div className="text-[11px] font-medium">Data outputs</div>
        <div className="text-[10px] text-muted-foreground">
          Connect these typed values to compatible downstream inputs.
        </div>
      </div>
      {outputs.map((output) => (
        <div key={output.id} className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[11px]">
            {output.label}
          </span>
          <code className="text-[9px] text-muted-foreground">{output.id}</code>
          <DataTypeBadge type={output.dataType} />
        </div>
      ))}
    </section>
  );
}

function FlowPorts({
  inputPorts,
  outputPorts,
}: {
  inputPorts: readonly string[];
  outputPorts: readonly string[];
}) {
  const rows = [
    { label: "Inputs", ports: inputPorts },
    { label: "Outputs", ports: outputPorts },
  ].filter((row) => row.ports.length > 0);

  return (
    <section className="flex flex-col gap-2 rounded-lg border p-2">
      <div>
        <div className="text-[11px] font-medium">Flow ports</div>
        <div className="text-[10px] text-muted-foreground">
          Connect these handles to control execution order.
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          This block has no flow ports.
        </p>
      ) : (
        rows.map((row) => (
          <div key={row.label} className="flex min-w-0 items-center gap-2">
            <span className="w-12 shrink-0 text-[10px] text-muted-foreground">
              {row.label}
            </span>
            <div className="flex min-w-0 flex-wrap gap-1">
              {row.ports.map((port) => (
                <Badge key={port} size="sm" variant="outline">
                  {port}
                </Badge>
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}

export function BlockInspectorTab() {
  const { library, flow } = useWorkbench();
  const { selectedScript } = library;
  const { selectedNodes, selectedNode, deleteNode, updateNodeData, edges } = flow;

  if (selectedScript === null) {
    return (
      <Empty className="px-4 py-6">
        <EmptyMedia variant="icon">
          <BlocksIcon />
        </EmptyMedia>
        <EmptyTitle className="text-sm">No block selected</EmptyTitle>
        <EmptyDescription>
          Select a block in the editor to edit its properties.
        </EmptyDescription>
      </Empty>
    );
  }

  if (selectedNode === null) {
    return (
      <Empty className="px-4 py-6">
        <EmptyMedia variant="icon">
          <BlocksIcon />
        </EmptyMedia>
        <EmptyTitle className="text-sm">
          {selectedNodes.length > 1
            ? `${selectedNodes.length} blocks selected`
            : "No block selected"}
        </EmptyTitle>
        <EmptyDescription>
          {selectedNodes.length > 1
            ? "Select a single block to edit its properties."
            : "Select a block in the editor to edit its properties."}
        </EmptyDescription>
      </Empty>
    );
  }

  const data = selectedNode.data;
  const definition = BLOCK_DEFINITIONS[data.kind];
  const fields: FieldDefinition[] = definition?.fields ?? [];
  const dataPorts = FLOW_NODE_DATA_PORTS[data.kind];
  const inputPortByField = new Map(
    dataPorts.inputs.map((port) => [port.field ?? port.id, port]),
  );
  const inputFields = fields.filter((field) => inputPortByField.has(field.name));
  const settingFields = fields.filter((field) => !inputPortByField.has(field.name));
  const connectedInputIds = new Set(
    edges
      .filter((edge) => edge.target === selectedNode.id)
      .map((edge) => edge.targetHandle)
      .filter((handle): handle is string => typeof handle === "string"),
  );
  const Icon = definition?.icon;

  const commit = (name: string, value: JsonValue) => {
    updateNodeData(selectedNode.id, { [name]: value });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-2">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">
            {definition?.label ?? "Block"}
          </div>
          <div className="truncate text-[10px] text-muted-foreground">
            {definition?.description ?? "Unknown block type"}
          </div>
        </div>
        <Badge size="sm" variant="outline">
          {data.kind}
        </Badge>
      </div>

      <FlowPorts
        inputPorts={definition?.inputPorts ?? []}
        outputPorts={definition?.outputPorts ?? []}
      />

      {inputFields.length > 0 && (
        <section className="flex flex-col gap-2.5 rounded-lg border p-2">
          <div>
            <div className="text-[11px] font-medium">Data inputs</div>
            <div className="text-[10px] text-muted-foreground">
              Use a local value, or connect a compatible upstream output.
            </div>
          </div>
          {inputFields.map((field) => {
            const port = inputPortByField.get(field.name);
            return (
              <FieldEditor
                key={field.name}
                field={field}
                value={data[field.name]}
                dataType={port?.dataType}
                connected={port ? connectedInputIds.has(port.id) : false}
                onChange={(value) => commit(field.name, value)}
              />
            );
          })}
        </section>
      )}

      <DataOutputs outputs={dataPorts.outputs} />

      {settingFields.length > 0 && (
        <section className="flex flex-col gap-2.5 rounded-lg border p-2">
          <div>
            <div className="text-[11px] font-medium">Settings</div>
            <div className="text-[10px] text-muted-foreground">
              Node options that are not connectable data inputs.
            </div>
          </div>
          {settingFields.map((field) => (
            <FieldEditor
              key={field.name}
              field={field}
              value={data[field.name]}
              onChange={(value) => commit(field.name, value)}
            />
          ))}
        </section>
      )}

      {fields.length === 0 && (
        <section className="flex flex-col gap-2.5 rounded-lg border p-2">
          <p className="text-[11px] text-muted-foreground">
            This block has no editable properties.
          </p>
        </section>
      )}

      <div className="flex items-center justify-between rounded-lg border px-2 py-1.5">
        <span className="text-[11px] text-muted-foreground">
          Restore a revision to replace this graph, or delete the block.
        </span>
        <Button
          size="xs"
          variant="destructive-outline"
          onClick={() => deleteNode(selectedNode.id)}
        >
          <Trash2Icon />
          Delete
        </Button>
      </div>

    </div>
  );
}
