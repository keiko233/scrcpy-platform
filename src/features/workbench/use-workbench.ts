import { createContext, useContext } from "react";

import type { RevisionDto, ScreenRegion } from "@/shared/project-contracts";

import type { DeviceManager } from "./device/use-devices";
import type { FlowEditor } from "./flow/use-flow-editor";
import type { ScriptLibrary } from "./library/use-script-library";
import type { ScreenManager } from "./screen/use-screens";
import type { FlowRunManager } from "./run/use-flow-run";
import type { ScreenPoint } from "./monitor/screen-region-selection";

export interface ScreenRegionSelectionManager {
  nodeId: string | null;
  start: (nodeId: string) => void;
  cancel: () => void;
  complete: (region: ScreenRegion) => void;
}

export interface ScreenPointSelectionManager {
  nodeId: string | null;
  start: (nodeId: string) => void;
  cancel: () => void;
  complete: (point: ScreenPoint) => void;
}

export interface WorkbenchContextValue {
  library: ScriptLibrary;
  devices: DeviceManager;
  screens: ScreenManager;
  flow: FlowEditor;
  runs: FlowRunManager;
  screenRegionSelection: ScreenRegionSelectionManager;
  screenPointSelection: ScreenPointSelectionManager;
  selectProjectSafe: (projectId: string) => void;
  selectScriptSafe: (scriptId: string | null) => void;
  restoreRevisionSafe: (revision: RevisionDto) => Promise<boolean>;
}

export const WorkbenchContext =
  createContext<WorkbenchContextValue | null>(null);

export function useWorkbench(): WorkbenchContextValue {
  const value = useContext(WorkbenchContext);
  if (value === null) {
    throw new Error("useWorkbench must be used within a WorkbenchProvider");
  }
  return value;
}
