import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertTriangleIcon,
  FileCode2Icon,
  FolderIcon,
  FolderPlusIcon,
  HistoryIcon,
  PlusIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { useWorkbench } from "../use-workbench";
import { m } from "@/paraglide/messages.js";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function InlineForm({
  placeholder,
  onSubmit,
  busy,
  onCancel,
  submitLabel,
}: {
  placeholder: string;
  onSubmit: (value: string) => Promise<unknown>;
  busy: boolean;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [value, setValue] = useState("");
  const canSubmit = value.trim().length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) {
      return;
    }
    const ok = await onSubmit(value);
    if (ok !== null && ok !== false) {
      setValue("");
      onCancel();
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <Input
        size="sm"
        autoFocus
        placeholder={placeholder}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            void submit();
          }
        }}
      />
      <Button size="sm" variant="outline" disabled={!canSubmit} loading={busy} onClick={() => void submit()}>
        {submitLabel}
      </Button>
      <Button size="icon-sm" variant="ghost" aria-label={m.script_browser_cancel_aria()} onClick={onCancel}>
        <XIcon />
      </Button>
    </div>
  );
}

export function ScriptBrowser() {
  const { library, flow, restoreRevisionSafe, selectProjectSafe, selectScriptSafe } = useWorkbench();
  const {
    projects,
    scripts,
    revisions,
    selectedProjectId,
    selectedScriptId,
    selectedScript,
    loading,
    error,
    busy,
    createProject,
    createScript,
    createRevision,
  } = library;

  const [creatingProject, setCreatingProject] = useState(false);
  const [creatingScript, setCreatingScript] = useState(false);

  const createRevisionAction = async (): Promise<boolean> => {
    if (flow.dirty && !(await flow.save())) {
      return false;
    }
    return createRevision(m.script_browser_checkpoint_fallback());
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-card">
      <div className="flex h-7 shrink-0 items-center gap-2 border-b bg-muted/40 px-2 text-xs font-medium text-muted-foreground">
        <FolderIcon className="size-3.5" />
        {m.script_browser_files()}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-1.5">
        {error !== null && (
          <Alert variant="warning" className="gap-1.5 px-2.5 py-1.5 text-xs">
            <AlertTriangleIcon />
            <AlertTitle className="text-xs">{m.script_browser_library_error()}</AlertTitle>
            <AlertDescription className="text-[11px]">{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
            <Spinner className="size-4" />
            {m.script_browser_loading_projects()}
          </div>
        ) : projects.length === 0 ? (
          <Empty className="gap-3 px-3 py-6">
            <FolderPlusIcon className="size-5 text-muted-foreground" />
            <p className="text-xs font-medium">{m.script_browser_no_projects()}</p>
            <p className="text-[11px] text-muted-foreground">{m.script_browser_no_projects_description()}</p>
            {creatingProject ? (
              <InlineForm
                placeholder={m.script_browser_project_name_placeholder()}
                submitLabel={m.script_browser_create()}
                busy={busy}
                onSubmit={async (name) => {
                  const project = await createProject(name);
                  if (project !== null) {
                    selectProjectSafe(project.id);
                  }
                  return project !== null;
                }}
                onCancel={() => setCreatingProject(false)}
              />
            ) : (
              <Button size="sm" variant="outline" onClick={() => setCreatingProject(true)}>
                <FolderPlusIcon />
                {m.script_browser_create_project()}
              </Button>
            )}
          </Empty>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <Select
                value={selectedProjectId ?? ""}
                onValueChange={(value) => {
                  if (value !== null) {
                    selectProjectSafe(String(value));
                  }
                }}
              >
                <SelectTrigger size="sm">
                  <SelectValue placeholder={m.script_browser_choose_project()} />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="icon-sm"
                variant="outline"
                aria-label={m.script_browser_create_project_aria()}
                onClick={() => setCreatingProject((open) => !open)}
              >
                <FolderPlusIcon />
              </Button>
            </div>

            {creatingProject && (
              <InlineForm
                placeholder={m.script_browser_project_name_placeholder()}
                submitLabel={m.script_browser_create()}
                busy={busy}
                onSubmit={async (name) => {
                  const project = await createProject(name);
                  if (project !== null) {
                    selectProjectSafe(project.id);
                  }
                  return project !== null;
                }}
                onCancel={() => setCreatingProject(false)}
              />
            )}

            {selectedProjectId !== null && (
              <div className="mt-1 flex flex-col gap-1">
                {scripts.length === 0 ? (
                  <p className="px-1 py-1 text-[11px] text-muted-foreground">
                    {m.script_browser_no_scripts()}
                  </p>
                ) : (
                  scripts.map((script) => {
                    const isSelected = script.id === selectedScriptId;
                    const isDirty = isSelected && script.id === selectedScript?.id && flow.dirty;
                    return (
                      <button
                        key={script.id}
                        type="button"
                        onClick={() => selectScriptSafe(script.id)}
                        className={cn(
                          "flex min-w-0 items-center gap-2 rounded-md border px-2 py-1 text-left text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                          isSelected
                            ? "border-primary bg-accent text-accent-foreground"
                            : "border-transparent text-foreground hover:bg-accent/60",
                        )}
                      >
                        <FileCode2Icon className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {script.name}
                            {isDirty && (
                              <span
                                className="ms-1 inline-block size-1.5 rounded-full bg-warning align-middle"
                                aria-label={m.script_browser_unsaved_changes_aria()}
                              />
                            )}
                          </span>
                          <span className="block truncate font-mono text-[10px] text-muted-foreground">
                            {script.path} · v{script.draftVersion}
                          </span>
                        </span>
                      </button>
                    );
                  })
                )}

                <Button
                  size="sm"
                  variant="ghost"
                  className="justify-start"
                  disabled={selectedProjectId === null}
                  onClick={() => setCreatingScript((open) => !open)}
                >
                  <PlusIcon />
                  {m.script_browser_new_script()}
                </Button>
                {creatingScript && (
                  <InlineForm
                    placeholder={m.script_browser_script_name_placeholder()}
                    submitLabel={m.script_browser_create()}
                    busy={busy}
                    onSubmit={createScript}
                    onCancel={() => setCreatingScript(false)}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <Separator />

      <div className="flex h-8 shrink-0 items-center gap-2 pl-1.5">
        <HistoryIcon className="size-3.5 text-muted-foreground" />
        <span className="text-[10px] font-medium text-muted-foreground">{m.script_browser_versions()}</span>

        <div className="flex-1" />

        <Button
          size="sm"
          variant="secondary"
          disabled={selectedScript === null || busy || flow.saveState === "saving"}
          loading={busy || flow.saveState === "saving"}
          onClick={() => void createRevisionAction()}
        >
          <PlusIcon />
          {m.script_browser_checkpoint()}
        </Button>
      </div>

      <div className="max-h-36 min-h-0 overflow-y-auto border-t p-1.5">
        {selectedScript === null ? (
          <p className="px-1 py-1 text-[11px] text-muted-foreground">{m.script_browser_select_script_history()}</p>
        ) : revisions.length === 0 ? (
          <p className="px-1 py-1 text-[11px] text-muted-foreground">{m.script_browser_no_revisions()}</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {[...revisions].reverse().map((revision) => (
              <li
                key={revision.id}
                className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-medium">
                    v{revision.revisionNumber}
                    <span className="ms-1 font-normal text-muted-foreground">
                      {formatDate(revision.createdAt)}
                    </span>
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {revision.message ?? m.script_browser_checkpoint_fallback()}
                  </div>
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  aria-label={m.script_browser_rollback_aria({ revisionNumber: revision.revisionNumber })}
                  onClick={() => void restoreRevisionSafe(revision)}
                >
                  <RotateCcwIcon />
                  {m.script_browser_rollback()}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
