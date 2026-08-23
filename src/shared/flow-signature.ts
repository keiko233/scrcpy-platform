import {
  flowInputNodeParams,
  flowOutputNodeResults,
  isFlowDataType,
  isValidFlowPortName,
  matchesFlowDataType,
  type FlowDataType,
  type FlowDocument,
  type FlowNode,
  type FlowScriptParam,
  type FlowScriptResult,
  type FlowScriptSignature,
  type FlowValidationIssue,
  type JsonValue,
} from "./project-contracts";

export type DerivedFlowSignature =
  | { ok: true; signature: FlowScriptSignature }
  | { ok: false; issues: FlowValidationIssue[] };

/**
 * Validates the boundary nodes (input / output) of a document. Shared by
 * signature derivation and graph validation so both report identical issues.
 */
export function validateBoundaryNodes(
  sortedNodes: readonly FlowNode[],
): FlowValidationIssue[] {
  const issues: FlowValidationIssue[] = [];
  const paramsByName = new Map<string, string>();
  let referenceResults: FlowScriptResult[] | null = null;

  for (const node of sortedNodes) {
    if (node.type === "input") {
      collectParamIssues(node, paramsByName, issues);
    } else if (node.type === "output") {
      collectOutputIssues(node, referenceResults, issues);
      if (referenceResults === null) {
        referenceResults = readDeclaredResults(node);
      }
    }
  }
  return issues;
}

/**
 * Derives the callable surface of a script from its input / output nodes.
 * Returns the signature only when every boundary declaration is valid and at
 * least one output node exists; otherwise it returns the blocking issues.
 */
export function deriveFlowSignature(
  document: FlowDocument,
): DerivedFlowSignature {
  const nodes = [...document.nodes].sort(compareNodesByPosition);
  const issues = validateBoundaryNodes(nodes);

  if (!document.nodes.some((node) => node.type === "output")) {
    issues.push({
      kind: "missing-output",
      message:
        "Flow has no Output node; it cannot be called as a function. Add an Output node or run it as a plain flow.",
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const params: FlowScriptParam[] = [];
  for (const node of nodes) {
    if (node.type === "input") {
      params.push(...flowInputNodeParams(node.data));
    }
  }
  let results: FlowScriptResult[] = [];
  for (const node of nodes) {
    if (node.type === "output") {
      results = flowOutputNodeResults(node.data);
      break;
    }
  }
  return { ok: true, signature: { params, results } };
}

/**
 * Best-effort signature used while a target script is still being edited. It
 * reads the boundary declarations leniently (de-duplicating parameter names,
 * tolerating invalid entries) so Call nodes can always show wiring ports even
 * when the target is not yet a valid callable. For valid documents it matches
 * {@link deriveFlowSignature} exactly.
 */
export function bestEffortFlowSignature(
  document: FlowDocument,
): FlowScriptSignature {
  const nodes = [...document.nodes].sort(compareNodesByPosition);
  const params: FlowScriptParam[] = [];
  const seen = new Set<string>();
  for (const node of nodes) {
    if (node.type !== "input") {
      continue;
    }
    for (const param of flowInputNodeParams(node.data)) {
      if (seen.has(param.name)) {
        continue;
      }
      seen.add(param.name);
      params.push(param);
    }
  }
  let results: FlowScriptResult[] = [];
  for (const node of nodes) {
    if (node.type === "output") {
      results = flowOutputNodeResults(node.data);
      break;
    }
  }
  return { params, results };
}

/** Distinct non-empty target script ids referenced by call nodes. */
export function collectCallTargets(document: FlowDocument): string[] {
  const targets: string[] = [];
  for (const node of document.nodes) {
    if (node.type !== "call") {
      continue;
    }
    const raw = node.data.targetScriptId;
    const targetId = typeof raw === "string" ? raw.trim() : "";
    if (targetId.length > 0 && !targets.includes(targetId)) {
      targets.push(targetId);
    }
  }
  return targets;
}

/**
 * Detects a cycle in the cross-script call graph reachable from rootId.
 * Returns the offending path of script ids, or null when acyclic.
 */
export function detectCallCycle(
  rootId: string,
  getDocument: (scriptId: string) => FlowDocument | null | undefined,
): string[] | null {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  const visit = (scriptId: string): string[] | null => {
    if (visited.has(scriptId)) {
      return null;
    }
    visiting.add(scriptId);
    stack.push(scriptId);
    const document = getDocument(scriptId);
    for (const target of document ? collectCallTargets(document) : []) {
      if (visiting.has(target)) {
        const start = stack.indexOf(target);
        return [...stack.slice(start), target];
      }
      const cycle = visit(target);
      if (cycle !== null) {
        return cycle;
      }
    }
    stack.pop();
    visiting.delete(scriptId);
    visited.add(scriptId);
    return null;
  };

  return visit(rootId);
}

function compareNodesByPosition(left: FlowNode, right: FlowNode): number {
  return (
    left.position.y - right.position.y ||
    left.position.x - right.position.x ||
    left.id.localeCompare(right.id)
  );
}

function collectParamIssues(
  node: FlowNode,
  paramsByName: Map<string, string>,
  issues: FlowValidationIssue[],
): void {
  for (const entry of readRawParamEntries(node)) {
    const { name } = entry;
    if (name.length === 0) {
      issues.push({
        kind: "missing-param-name",
        nodeId: node.id,
        message: `Input node "${node.id}" has a parameter without a name.`,
      });
      continue;
    }
    const owner = paramsByName.get(name);
    if (!isValidFlowPortName(name)) {
      issues.push({
        kind: "invalid-param-name",
        nodeId: node.id,
        port: name,
        message: `Parameter name "${name}" on input node "${node.id}" is invalid; use letters, digits and underscores, and avoid reserved handles.`,
      });
    }
    if (owner !== undefined) {
      issues.push({
        kind: "duplicate-param-name",
        nodeId: node.id,
        port: name,
        message: `Parameter name "${name}" is already declared by input node "${owner}".`,
      });
    } else {
      paramsByName.set(name, node.id);
    }
    if (!entry.hasValidDataType) {
      issues.push({
        kind: "invalid-data-type",
        nodeId: node.id,
        message: `Input node "${node.id}" declares unknown data type "${String(entry.rawDataType)}" for parameter "${name}".`,
      });
    }
    if (
      entry.defaultValue !== undefined &&
      !matchesFlowDataType(entry.defaultValue, entry.dataType)
    ) {
      issues.push({
        kind: "invalid-default-value",
        nodeId: node.id,
        message: `Default value of parameter "${name}" on input node "${node.id}" does not match its data type "${entry.dataType}".`,
      });
    }
  }
}

interface RawParamEntry {
  name: string;
  dataType: FlowDataType;
  rawDataType: unknown;
  hasValidDataType: boolean;
  defaultValue: JsonValue | undefined;
}

/**
 * Reads the raw parameter declarations of an Input node, preserving empty and
 * invalid values so validation can report them. Supports both the modern
 * `params` array and the legacy single-parameter shape.
 */
function readRawParamEntries(node: FlowNode): RawParamEntry[] {
  const pushEntry = (record: Readonly<Record<string, unknown>>): RawParamEntry => {
    const rawDataType = record.dataType;
    const dataType = isFlowDataType(rawDataType) ? rawDataType : "any";
    const defaultValue = record.defaultValue;
    return {
      name: typeof record.name === "string" ? record.name.trim() : "",
      dataType,
      rawDataType,
      hasValidDataType: isFlowDataType(rawDataType),
      defaultValue:
        defaultValue === undefined || defaultValue === null
          ? undefined
          : (defaultValue as JsonValue),
    };
  };

  const raw = node.data.params;
  if (Array.isArray(raw)) {
    const entries: RawParamEntry[] = [];
    for (const item of raw) {
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        continue;
      }
      entries.push(pushEntry(item as Record<string, unknown>));
    }
    return entries;
  }
  if (typeof node.data.paramName === "string") {
    return [
      pushEntry({
        name: node.data.paramName,
        dataType: node.data.dataType,
        defaultValue: node.data.defaultValue,
      }),
    ];
  }
  return [];
}

interface RawResultEntry {
  name: string;
  dataType: FlowDataType;
  hasValidDataType: boolean;
}

function readRawResultEntries(node: FlowNode): RawResultEntry[] {
  const raw = node.data.results;
  if (!Array.isArray(raw)) {
    return [];
  }
  const entries: RawResultEntry[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    entries.push({
      name: typeof record.name === "string" ? record.name.trim() : "",
      dataType: isFlowDataType(record.dataType) ? record.dataType : "any",
      hasValidDataType: isFlowDataType(record.dataType),
    });
  }
  return entries;
}

function readDeclaredResults(node: FlowNode): FlowScriptResult[] {
  return readRawResultEntries(node).map(({ name, dataType }) => ({
    name,
    dataType,
  }));
}

function collectOutputIssues(
  node: FlowNode,
  referenceResults: FlowScriptResult[] | null,
  issues: FlowValidationIssue[],
): void {
  const entries = readRawResultEntries(node);
  const namesInNode = new Set<string>();

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index] as RawResultEntry;
    if (entry.name.length === 0) {
      issues.push({
        kind: "missing-param-name",
        nodeId: node.id,
        message: `Result #${index + 1} on output node "${node.id}" has no name.`,
      });
      continue;
    }
    if (!isValidFlowPortName(entry.name)) {
      issues.push({
        kind: "invalid-param-name",
        nodeId: node.id,
        port: entry.name,
        message: `Result name "${entry.name}" on output node "${node.id}" is invalid; use letters, digits and underscores, and avoid reserved handles.`,
      });
    }
    if (namesInNode.has(entry.name)) {
      issues.push({
        kind: "duplicate-result-name",
        nodeId: node.id,
        port: entry.name,
        message: `Result name "${entry.name}" is declared more than once on output node "${node.id}".`,
      });
    }
    namesInNode.add(entry.name);
    if (!entry.hasValidDataType) {
      issues.push({
        kind: "invalid-data-type",
        nodeId: node.id,
        message: `Output node "${node.id}" declares an unknown data type for result "${entry.name}".`,
      });
    }
  }

  if (
    referenceResults !== null &&
    !sameResults(referenceResults, readDeclaredResults(node))
  ) {
    issues.push({
      kind: "inconsistent-output-ports",
      nodeId: node.id,
      message: `Output node "${node.id}" declares a different result set than the other output nodes; every return point must expose the same names and types.`,
    });
  }
}

function sameResults(
  left: readonly FlowScriptResult[],
  right: readonly FlowScriptResult[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const dataTypesByName = new Map(
    right.map((result) => [result.name, result.dataType]),
  );
  return left.every(
    (result) => dataTypesByName.get(result.name) === result.dataType,
  );
}
