import { useCallback, useState, type ReactNode } from "react";

import type { RevisionDto, ScreenRegion } from "@/shared/project-contracts";
import { useDevices } from "@/features/workbench/device/use-devices";
import { FlowApiContext } from "@/features/workbench/flow/flow-api-context";
import { useFlowEditor } from "@/features/workbench/flow/use-flow-editor";
import { useScriptLibrary } from "@/features/workbench/library/use-script-library";
import { useScreens } from "@/features/workbench/screen/use-screens";
import { useFlowRun } from "@/features/workbench/run/use-flow-run";
import {
  WorkbenchContext,
  type WorkbenchContextValue,
} from "@/features/workbench/use-workbench";

export function WorkbenchProvider({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  const library = useScriptLibrary();
  const devices = useDevices();
  const screens = useScreens(devices);
  const flow = useFlowEditor(library.selectedScript, library.applyScriptUpdate);
  const runs = useFlowRun();
  const [screenRegionNodeId, setScreenRegionNodeId] = useState<string | null>(
    null,
  );

  const {
    selectedProjectId,
    selectedScript,
    selectProject,
    selectScript,
    restoreRevision,
  } = library;
  const { reloadLatest, updateNodeData } = flow;
  const activeScreenRegionNodeId =
    screenRegionNodeId !== null &&
    flow.nodes.some(
      (node) =>
        node.id === screenRegionNodeId && node.data.kind === "screen-region",
    )
      ? screenRegionNodeId
      : null;

  const startScreenRegionSelection = useCallback((nodeId: string) => {
    setScreenRegionNodeId(nodeId);
  }, []);

  const cancelScreenRegionSelection = useCallback(() => {
    setScreenRegionNodeId(null);
  }, []);

  const completeScreenRegionSelection = useCallback(
    (region: ScreenRegion) => {
      if (activeScreenRegionNodeId === null) {
        return;
      }
      updateNodeData(activeScreenRegionNodeId, region);
      setScreenRegionNodeId(null);
    },
    [activeScreenRegionNodeId, updateNodeData],
  );

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
    screens,
    flow,
    runs,
    screenRegionSelection: {
      nodeId: activeScreenRegionNodeId,
      start: startScreenRegionSelection,
      cancel: cancelScreenRegionSelection,
      complete: completeScreenRegionSelection,
    },
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
