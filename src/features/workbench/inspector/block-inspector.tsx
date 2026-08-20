import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BlocksIcon, Trash2Icon } from "lucide-react";
import type { JsonValue } from "@/shared/project-contracts";

import { BLOCK_DEFINITIONS } from "../blocks";
import type { FieldDefinition } from "../types";
import { useWorkbench } from "../use-workbench";

function NumberInput({
  value,
  onChange,
  placeholder,
  min,
  step,
}: {
  value: unknown;
  onChange: (value: number | null) => void;
  placeholder?: string;
  min?: number;
  step?: number;
}) {
  return (
    <Input
      type="number"
      min={min}
      step={step}
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

export function BlockInspectorTab() {
  const { library, flow } = useWorkbench();
  const { selectedScript } = library;
  const { selectedNodes, selectedNode, deleteNode, updateNodeData } = flow;

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

      <div className="flex flex-col gap-2.5 rounded-lg border p-2">
        {fields.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            This block has no editable properties.
          </p>
        ) : (
          fields.map((field) => (
            <div key={field.name} className="flex flex-col gap-1">
              <Label className="text-[11px] text-muted-foreground">
                {field.label}
              </Label>
              {field.kind === "textarea" ? (
                <Textarea
                  rows={2}
                  placeholder={field.placeholder}
                  value={String(data[field.name] ?? "")}
                  onChange={(event) => commit(field.name, event.target.value)}
                />
              ) : field.kind === "number" ? (
                <NumberInput
                  value={data[field.name]}
                  min={field.min}
                  step={field.step}
                  placeholder={field.placeholder}
                  onChange={(next) => commit(field.name, next)}
                />
              ) : (
                <Input
                  placeholder={field.placeholder}
                  value={String(data[field.name] ?? "")}
                  onChange={(event) => commit(field.name, event.target.value)}
                />
              )}
            </div>
          ))
        )}
      </div>

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
