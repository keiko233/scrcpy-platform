import { createContext, useContext } from "react";

import type { XYPosition } from "@xyflow/react";
import type { JsonValue } from "@/shared/project-contracts";

import type { FlowBlockKind } from "../types";

export interface FlowApi {
  addBlock: (
    kind: FlowBlockKind,
    position?: XYPosition,
    parentId?: string,
  ) => string;
  addBlockReference: (sourceNodeId: string, position?: XYPosition) => string | null;
  deleteNode: (id: string) => void;
  updateNodeData: (id: string, patch: Record<string, JsonValue>) => void;
}

export const FlowApiContext = createContext<FlowApi | null>(null);

export function useFlowApi(): FlowApi {
  const api = useContext(FlowApiContext);
  if (api === null) {
    throw new Error("useFlowApi must be used within a WorkbenchProvider");
  }
  return api;
}
