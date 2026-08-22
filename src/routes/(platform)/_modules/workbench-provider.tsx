import { useCallback, useState, type ReactNode } from "react";

import type { RevisionDto, ScreenRegion } from "@/shared/project-contracts";
import { useDevices } from "@/features/workbench/device/use-devices";
import { FlowApiContext } from "@/features/workbench/flow/flow-api-context";
import { useFlowEditor } from "@/features/workbench/flow/use-flow-editor";
import { useScriptLibrary } from "@/features/workbench/library/use-script-library";
import { useScreens } from "@/features/workbench/screen/use-screens";
import { useFlowRun } from "@/features/workbench/run/use-flow-run";
import type { ScreenPoint } from "@/features/workbench/monitor/screen-region-selection";
import {
  WorkbenchContext,
  type WorkbenchContextValue,
} from "@/features/workbench/use-workbench";
import { m } from "@/paraglide/messages.js";

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
  const [screenPointNodeId, setScreenPointNodeId] = useState<string | null>(
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
  const activeScreenPointNodeId =
    screenPointNodeId !== null &&
    flow.nodes.some(
      (node) => node.id === screenPointNodeId && node.data.kind === "click",
    )
      ? screenPointNodeId
      : null;

  const startScreenRegionSelection = useCallback((nodeId: string) => {
    setScreenPointNodeId(null);
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

  const startScreenPointSelection = useCallback((nodeId: string) => {
    setScreenRegionNodeId(null);
    setScreenPointNodeId(nodeId);
  }, []);

  const cancelScreenPointSelection = useCallback(() => {
    setScreenPointNodeId(null);
  }, []);

  const completeScreenPointSelection = useCallback(
    (point: ScreenPoint) => {
      if (activeScreenPointNodeId === null) {
        return;
      }
      updateNodeData(activeScreenPointNodeId, point);
      setScreenPointNodeId(null);
    },
    [activeScreenPointNodeId, updateNodeData],
  );

  const selectProjectSafe = useCallback(
    (projectId: string) => {
      if (flow.dirty && projectId !== selectedProjectId) {
        const discard = window.confirm(
          selectedScript
            ? m.workbench_confirm_discard_project_with_name({
                name: selectedScript.name,
              })
            : m.workbench_confirm_discard_project_without_name(),
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
            ? m.workbench_confirm_discard_script_with_name({ name: current.name })
            : m.workbench_confirm_discard_script_without_name(),
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
        m.workbench_confirm_rollback({
          revisionNumber: revision.revisionNumber,
          discardSuffix: flow.dirty
            ? m.workbench_confirm_rollback_discard_suffix()
            : "",
        }),
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
    screenPointSelection: {
      nodeId: activeScreenPointNodeId,
      start: startScreenPointSelection,
      cancel: cancelScreenPointSelection,
      complete: completeScreenPointSelection,
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
