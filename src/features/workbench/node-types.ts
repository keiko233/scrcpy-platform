import type { NodeTypes } from "@xyflow/react";

import { BlockNodeComponent } from "./block-node";
import { BLOCK_DEFINITIONS } from "./blocks";

export const AUTOMATION_NODE_TYPES: NodeTypes = Object.fromEntries(
  Object.keys(BLOCK_DEFINITIONS).map((kind) => [kind, BlockNodeComponent]),
) as NodeTypes;
