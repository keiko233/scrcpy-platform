import { useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Empty } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverPopup,
  type PopoverPrimitive,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import {
  AlertTriangleIcon,
  FileCode2Icon,
  FolderIcon,
  FolderPlusIcon,
  HistoryIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import type { ProjectDto, ScriptDto } from "@/shared/project-contracts";

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

type PopoverSide = PopoverPrimitive.Positioner.Props["side"];
type PopoverAlign = PopoverPrimitive.Positioner.Props["align"];

function NameFormPopover({
  open,
  onOpenChange,
  anchor,
  title,
  initialValue = "",
  placeholder,
  submitLabel,
  busy,
  side = "bottom",
  align = "start",
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: React.RefObject<Element | null> | null;
  title: string;
  initialValue?: string;
  placeholder: string;
  submitLabel: string;
  busy: boolean;
  side?: PopoverSide;
  align?: PopoverAlign;
  onSubmit: (value: string) => Promise<unknown>;
}) {
  const [value, setValue] = useState(initialValue);

  const canSubmit = value.trim().length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) {
      return;
    }
    const ok = await onSubmit(value);
    if (ok !== null && ok !== false) {
      onOpenChange(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverPopup side={side} align={align} sideOffset={4} anchor={anchor}>
        <div className="flex min-w-56 flex-col gap-2">
          <p className="text-xs font-medium">{title}</p>
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
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
              {m.script_browser_cancel_aria()}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!canSubmit}
              loading={busy}
              onClick={() => void submit()}
            >
              {submitLabel}
            </Button>
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  );
}

function VersionsContent() {
  const { library, flow, restoreRevisionSafe } = useWorkbench();
  const { selectedScript, revisions, busy, createRevision } = library;

  const createRevisionAction = async (): Promise<boolean> => {
    if (flow.dirty && !(await flow.save())) {
      return false;
    }
    return createRevision(m.script_browser_checkpoint_fallback());
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 pl-1.5">
        <HistoryIcon className="size-3.5 text-muted-foreground" />
        <span className="text-[10px] font-medium text-muted-foreground">
          {m.script_browser_versions()}
        </span>

        <div className="flex-1" />

        <Button
          className="h-full!"
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

      <div className="min-h-0 flex-1 overflow-y-auto border-t p-1.5">
        {selectedScript === null ? (
          <p className="px-1 py-1 text-[11px] text-muted-foreground">
            {m.script_browser_select_script_history()}
          </p>
        ) : revisions.length === 0 ? (
          <p className="px-1 py-1 text-[11px] text-muted-foreground">
            {m.script_browser_no_revisions()}
          </p>
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

function trackElement(
  mapRef: React.RefObject<Map<string, Element>>,
  key: string,
) {
  return (element: Element | null) => {
    const map = mapRef.current;
    if (element === null) {
      map.delete(key);
    } else {
      map.set(key, element);
    }
  };
}

export function ScriptBrowser() {
  const { library, flow, selectProjectSafe, selectScriptSafe } = useWorkbench();
  const {
    projects,
    scripts,
    selectedProjectId,
    selectedScriptId,
    selectedScript,
    loading,
    error,
    busy,
    createProject,
    createScript,
    renameProject,
    deleteProject,
    renameScript,
    deleteScript,
  } = library;

  const [creatingProject, setCreatingProject] = useState(false);
  const [creatingScript, setCreatingScript] = useState(false);
  const [renamingProject, setRenamingProject] = useState<ProjectDto | null>(null);
  const [renamingScript, setRenamingScript] = useState<ScriptDto | null>(null);

  const createProjectAnchorRef = useRef<Element | null>(null);
  const createScriptAnchorRef = useRef<Element | null>(null);
  const renameProjectAnchorRef = useRef<Element | null>(null);
  const renameScriptAnchorRef = useRef<Element | null>(null);
  const projectTabRefs = useRef(new Map<string, Element>());
  const scriptTabRefs = useRef(new Map<string, Element>());

  const openCreateProject = (event: React.MouseEvent<HTMLElement>) => {
    createProjectAnchorRef.current = event.currentTarget;
    setRenamingProject(null);
    setCreatingProject(true);
  };

  const openCreateScript = (event: React.MouseEvent<HTMLElement>) => {
    createScriptAnchorRef.current = event.currentTarget;
    setRenamingScript(null);
    setCreatingScript(true);
  };

  const openRenameProject = (project: ProjectDto) => {
    renameProjectAnchorRef.current =
      projectTabRefs.current.get(project.id) ?? null;
    setCreatingProject(false);
    setRenamingProject(project);
  };

  const openRenameScript = (script: ScriptDto) => {
    renameScriptAnchorRef.current = scriptTabRefs.current.get(script.id) ?? null;
    setCreatingScript(false);
    setRenamingScript(script);
  };

  const requestDeleteProject = (project: ProjectDto) => {
    const confirmed = window.confirm(
      m.script_browser_confirm_delete_project({ name: project.name }),
    );
    if (!confirmed) {
      return;
    }
    void deleteProject(project.id);
  };

  const requestDeleteScript = (script: ScriptDto) => {
    const confirmed = window.confirm(
      m.script_browser_confirm_delete_script({ name: script.name }),
    );
    if (!confirmed) {
      return;
    }
    void deleteScript(script.id);
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-card">
      {error !== null && (
        <Alert variant="warning" className="mx-1.5 mt-1.5 gap-1.5 px-2.5 py-1.5 text-xs">
          <AlertTriangleIcon />
          <AlertTitle className="text-xs">{m.script_browser_library_error()}</AlertTitle>
          <AlertDescription className="text-[11px]">{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
          <Spinner className="size-4" />
          {m.script_browser_loading_projects()}
        </div>
      ) : projects.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-3">
          <Empty className="gap-3 px-3 py-6">
            <FolderPlusIcon className="size-5 text-muted-foreground" />
            <p className="text-xs font-medium">{m.script_browser_no_projects()}</p>
            <p className="text-[11px] text-muted-foreground">
              {m.script_browser_no_projects_description()}
            </p>
            <Button size="sm" variant="outline" onClick={openCreateProject}>
              <FolderPlusIcon />
              {m.script_browser_create_project()}
            </Button>
          </Empty>
        </div>
      ) : (
        <Tabs
          className="min-h-0 flex-1 gap-0"
          value={selectedProjectId ?? ""}
          onValueChange={(value) => {
            if (value !== null) {
              selectProjectSafe(String(value));
            }
          }}
        >
          <div className="flex shrink-0 items-stretch border-b bg-muted/40">
            <TabsList
              variant="underline"
              className="h-8 max-w-none flex-1 overflow-x-auto rounded-none border-0 bg-transparent p-0"
            >
              {projects.map((project) => (
                <ContextMenu key={project.id}>
                  <ContextMenuTrigger ref={trackElement(projectTabRefs, project.id)}>
                    <TabsTab value={project.id} className="max-w-40 px-2.5 text-xs">
                      <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 truncate">{project.name}</span>
                    </TabsTab>
                  </ContextMenuTrigger>
                  <ContextMenuPopup align="start" sideOffset={4}>
                    <ContextMenuItem onClick={() => openRenameProject(project)}>
                      <PencilIcon />
                      {m.script_browser_rename()}
                    </ContextMenuItem>
                    <ContextMenuItem variant="destructive" onClick={() => requestDeleteProject(project)}>
                      <Trash2Icon />
                      {m.script_browser_delete()}
                    </ContextMenuItem>
                  </ContextMenuPopup>
                </ContextMenu>
              ))}
            </TabsList>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={m.script_browser_create_project_aria()}
              className="shrink-0 self-center"
              onClick={openCreateProject}
            >
              <FolderPlusIcon />
            </Button>
          </div>

          {projects.map((project) => (
            <TabsPanel key={project.id} value={project.id} className="min-h-0 flex-1">
              <Tabs
                orientation="vertical"
                className="h-full min-h-0 gap-0"
                value={selectedScriptId ?? ""}
                onValueChange={(value) => {
                  if (value !== null) {
                    selectScriptSafe(String(value));
                  }
                }}
              >
                <TabsList
                  variant="underline"
                  className="w-44 shrink-0 overflow-y-auto rounded-none border-0 border-r bg-muted/30 p-0"
                >
                  {scripts.length === 0 ? (
                    <p className="px-2.5 py-2 text-[11px] text-muted-foreground">
                      {m.script_browser_no_scripts()}
                    </p>
                  ) : (
                    scripts.map((script) => {
                      const isSelected = script.id === selectedScriptId;
                      const isDirty =
                        isSelected &&
                        script.id === selectedScript?.id &&
                        flow.dirty;
                      return (
                        <ContextMenu key={script.id}>
                          <ContextMenuTrigger className="w-full" ref={trackElement(scriptTabRefs, script.id)}>
                            <TabsTab value={script.id} className="w-full gap-1.5 py-1.5 text-xs">
                              <FileCode2Icon className="size-3.5 shrink-0 text-muted-foreground" />
                              <div className="min-w-0 flex-1 flex items-start justify-between">
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
                                  v{script.draftVersion}
                                </span>
                              </div>
                            </TabsTab>
                          </ContextMenuTrigger>
                          <ContextMenuPopup align="start" sideOffset={4}>
                            <ContextMenuItem onClick={() => openRenameScript(script)}>
                              <PencilIcon />
                              {m.script_browser_rename()}
                            </ContextMenuItem>
                            <ContextMenuItem
                              variant="destructive"
                              onClick={() => requestDeleteScript(script)}
                            >
                              <Trash2Icon />
                              {m.script_browser_delete()}
                            </ContextMenuItem>
                          </ContextMenuPopup>
                        </ContextMenu>
                      );
                    })
                  )}

                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full justify-start p-1.75"
                      onClick={openCreateScript}
                    >
                      <PlusIcon />
                      {m.script_browser_new_script()}
                    </Button>
                </TabsList>

                <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                  {scripts.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-[11px] text-muted-foreground">
                      <FileCode2Icon className="size-4" />
                      {m.script_browser_no_scripts()}
                    </div>
                  ) : (
                    <VersionsContent />
                  )}
                </div>
              </Tabs>
            </TabsPanel>
          ))}
        </Tabs>
      )}

      <NameFormPopover
        open={creatingProject}
        onOpenChange={setCreatingProject}
        anchor={createProjectAnchorRef}
        title={m.script_browser_create_project()}
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
      />

      <NameFormPopover
        open={renamingProject !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRenamingProject(null);
          }
        }}
        anchor={renameProjectAnchorRef}
        title={m.script_browser_rename()}
        initialValue={renamingProject?.name ?? ""}
        placeholder={m.script_browser_project_name_placeholder()}
        submitLabel={m.script_browser_rename()}
        busy={busy}
        onSubmit={async (name) =>
          renamingProject === null
            ? false
            : renameProject(renamingProject.id, name)
        }
      />

      <NameFormPopover
        open={creatingScript}
        onOpenChange={setCreatingScript}
        anchor={createScriptAnchorRef}
        title={m.script_browser_new_script()}
        placeholder={m.script_browser_script_name_placeholder()}
        submitLabel={m.script_browser_create()}
        busy={busy}
        side="right"
        onSubmit={createScript}
      />

      <NameFormPopover
        open={renamingScript !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRenamingScript(null);
          }
        }}
        anchor={renameScriptAnchorRef}
        title={m.script_browser_rename()}
        initialValue={renamingScript?.name ?? ""}
        placeholder={m.script_browser_script_name_placeholder()}
        submitLabel={m.script_browser_rename()}
        busy={busy}
        side="right"
        onSubmit={async (name) =>
          renamingScript === null
            ? false
            : renameScript(renamingScript.id, name)
        }
      />
    </div>
  );
}