import { useMemo } from "react";

import { bestEffortFlowSignature } from "@/shared/flow-signature";
import {
  type FlowPortContext,
  type FlowScriptSignature,
  type ScriptDto,
} from "@/shared/project-contracts";

import { useWorkbench } from "../use-workbench";

/**
 * Builds a signature resolver over a snapshot of the project's scripts. Uses
 * the best-effort signature so Call nodes always expose wiring ports, even
 * while the target script is still being edited; the runtime re-validates
 * against the persisted drafts when the run starts.
 */
export function callSignatureResolverFrom(
  scripts: readonly ScriptDto[],
): (scriptId: string) => FlowScriptSignature | null {
  return (scriptId: string) => {
    const document = scripts.find((script) => script.id === scriptId)
      ?.draftDocument;
    return document === undefined ? null : bestEffortFlowSignature(document);
  };
}

/**
 * Renderer-side resolver for the signatures of callable scripts. Backed by
 * the scripts query of the current project, so Call nodes derive their
 * ports live while wiring. The runtime re-validates against the persisted
 * drafts when the run starts.
 */
export function useFlowPortContext(): FlowPortContext {
  const { library } = useWorkbench();
  const scripts = library.scripts;
  return useMemo(
    () => ({
      resolveCallSignature: callSignatureResolverFrom(scripts),
    }),
    [scripts],
  );
}
