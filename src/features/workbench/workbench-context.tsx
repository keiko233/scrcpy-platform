import { useCallback, type ReactNode } from "react";

import type { RevisionDto } from "@/shared/project-contracts";

import { useDevices } from "./device/use-devices";
import { FlowApiContext } from "./flow/flow-api-context";
import { useFlowEditor } from "./flow/use-flow-editor";
import { useScriptLibrary } from "./library/use-script-library";
import {
  WorkbenchContext,
  type WorkbenchContextValue,
} from "./use-workbench";

export function WorkbenchProvider({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  const library = useScriptLibrary();
  const devices = useDevices();
  const flow = useFlowEditor(library.selectedScript, library.applyScriptUpdate);

  const {
    selectedProjectId,
    selectedScript,
    selectProject,
    selectScript,
    restoreRevision,
  } = library;
  const { reloadLatest } = flow;

  const selectProjectSafe = useCallback(
    (projectId: string) => {
      if (flow.dirty && projectId !== selectedProjectId) {
        const discard = window.confirm(
          selectedScript
            ? `Discard unsaved changes to "${selectedScript.name}" and switch projects?`
            : "Discard unsaved changes and switch projects?",
        );
        if (!discard) {
          return;
        }
      }
      void selectProject(projectId);
    },
    [flow.dirty, selectedProjectId, selectedScript, selectProject],
  );

  const selectScriptSafe = useCallback(
    (scriptId: string | null) => {
      const current = selectedScript;
      if (flow.dirty && scriptId !== (current?.id ?? null)) {
        const discard = window.confirm(
          current
            ? `Discard unsaved changes to "${current.name}" and switch scripts?`
            : "Discard unsaved changes and switch scripts?",
        );
        if (!discard) {
          return;
        }
      }
      void selectScript(scriptId);
    },
    [selectedScript, selectScript, flow.dirty],
  );

  const restoreRevisionSafe = useCallback(
    async (revision: RevisionDto): Promise<boolean> => {
      const confirmed = window.confirm(
        `Rollback to revision ${revision.revisionNumber}? This replaces the current draft${flow.dirty ? " and discards unsaved changes" : ""}.`,
      );
      if (!confirmed) {
        return false;
      }
      const restored = await restoreRevision(revision);
      if (restored) {
        await reloadLatest();
      }
      return restored;
    },
    [flow.dirty, restoreRevision, reloadLatest],
  );

  const flowApi = {
    addBlock: flow.addBlock,
    deleteNode: flow.deleteNode,
    updateNodeData: flow.updateNodeData,
  };

  const value: WorkbenchContextValue = {
    library,
    devices,
    flow,
    selectProjectSafe,
    selectScriptSafe,
    restoreRevisionSafe,
  };

  return (
    <FlowApiContext.Provider value={flowApi}>
      <WorkbenchContext.Provider value={value}>
        {children}
      </WorkbenchContext.Provider>
    </FlowApiContext.Provider>
  );
}
