import {
  collectExpressionVariables,
  evaluateExpression,
} from "./expression";
import {
  flowDynamicPortId,
  type FlowDocument,
  type FlowEdge,
  type FlowNode,
  type JsonValue,
} from "./project-contracts";

export interface FlowMigrationResult {
  document: FlowDocument;
  warnings: string[];
  migrated: boolean;
}

type NodeData = Record<string, JsonValue>;

interface LegacyNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: NodeData;
}

const CONTROL_SOURCE_HANDLES = new Set(["next", "true", "false", "body", "done"]);
const CONTROL_TARGET_HANDLES = new Set(["in", "loop"]);

interface Producer {
  nodeId: string;
  port: string;
}

function isControlEdge(edge: FlowEdge): boolean {
  return (
    CONTROL_SOURCE_HANDLES.has(edge.sourceHandle ?? "") &&
    CONTROL_TARGET_HANDLES.has(edge.targetHandle ?? "")
  );
}

function controlOrder(
  nodes: readonly LegacyNode[],
  edges: readonly FlowEdge[],
): string[] {
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, number>();
  for (const node of nodes) {
    incoming.set(node.id, 0);
  }
  for (const edge of edges) {
    if (!isControlEdge(edge) || edge.targetHandle === "loop") {
      continue;
    }
    const list = outgoing.get(edge.source) ?? [];
    list.push(edge.target);
    outgoing.set(edge.source, list);
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  }
  const start = nodes.find((node) => node.type === "start");
  const order: string[] = [];
  const visited = new Set<string>();
  const queue = start === undefined ? [] : [start.id];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (visited.has(id)) {
      continue;
    }
    visited.add(id);
    order.push(id);
    for (const target of outgoing.get(id) ?? []) {
      const remaining = (incoming.get(target) ?? 0) - 1;
      incoming.set(target, remaining);
      if (remaining <= 0 && !visited.has(target)) {
        queue.push(target);
      }
    }
  }
  for (const node of nodes) {
    if (!visited.has(node.id)) {
      order.push(node.id);
    }
  }
  return order;
}

function isBareVariable(source: string, name: string): boolean {
  return (
    /^\$?[A-Za-z_][A-Za-z0-9_]*$/.test(source) &&
    source.replace(/^\$/, "") === name
  );
}

function numericLiteral(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Rewrites an old flow document into the wire-based (no global variables)
 * document model. This is best-effort: variable references that can be mapped
 * to a single producer are converted into data edges, literal operands become
 * Constant nodes, and control-flow-only blocks (compare) are lifted off the
 * control path. Anything ambiguous is left in place and reported via warnings.
 */
export function migrateFlowDocument(
  document: FlowDocument,
): FlowMigrationResult {
  const warnings: string[] = [];
  let changed = false;

  const nodes: LegacyNode[] = (document.nodes as unknown as LegacyNode[]).map(
    (node) => ({ ...node, data: { ...node.data } }),
  );
  let edges: FlowEdge[] = document.edges.map((edge) => ({ ...edge }));

  const synthesized: LegacyNode[] = [];
  const extraEdges: FlowEdge[] = [];
  const lastWriter = new Map<string, Producer>();
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const newEdgeId = () => `edge-${crypto.randomUUID()}`;
  const newNodeId = () => `node-${crypto.randomUUID()}`;

  const addConstant = (value: JsonValue): string => {
    const id = newNodeId();
    const data: NodeData = { kind: "constant" };
    if (typeof value === "boolean") {
      data.type = "boolean";
      data.booleanValue = value;
    } else if (typeof value === "string") {
      data.type = "string";
      data.stringValue = value;
    } else {
      data.type = "number";
      data.numberValue = typeof value === "number" ? value : 0;
    }
    synthesized.push({
      id,
      type: "constant",
      position: { x: 0, y: 0 },
      data,
    });
    return id;
  };

  const wire = (source: Producer, targetId: string, targetPort: string): void => {
    extraEdges.push({
      id: newEdgeId(),
      source: source.nodeId,
      target: targetId,
      sourceHandle: source.port,
      targetHandle: targetPort,
    });
    changed = true;
  };

  const resolveExpressionToPort = (
    targetId: string,
    portId: string,
    expression: string | undefined,
  ): void => {
    const source = (expression ?? "").trim();
    if (source.length === 0) {
      return;
    }
    const vars = collectExpressionVariables(source);
    if (vars.length === 0) {
      try {
        const value = evaluateExpression(source, {});
        wire({ nodeId: addConstant(value), port: "value" }, targetId, portId);
      } catch {
        warnings.push(
          `Could not evaluate literal "${source}" for ${targetId}.${portId}; connect it manually.`,
        );
      }
      return;
    }
    if (vars.length === 1 && isBareVariable(source, vars[0])) {
      const producer = lastWriter.get(vars[0]);
      if (producer !== undefined) {
        wire(producer, targetId, portId);
      } else {
        warnings.push(
          `Variable "${vars[0]}" referenced by ${targetId}.${portId} has no producer; connect it manually.`,
        );
      }
      return;
    }
    warnings.push(
      `Complex expression "${source}" on ${targetId}.${portId} was not migrated; connect it manually.`,
    );
  };

  const bypassControlEdges = (nodeId: string): void => {
    const inEdge = edges.find(
      (edge) =>
        edge.target === nodeId &&
        CONTROL_TARGET_HANDLES.has(edge.targetHandle ?? ""),
    );
    const outEdge = edges.find(
      (edge) =>
        edge.source === nodeId &&
        CONTROL_SOURCE_HANDLES.has(edge.sourceHandle ?? ""),
    );
    if (inEdge === undefined && outEdge === undefined) {
      return;
    }
    if (inEdge === undefined || outEdge === undefined) {
      warnings.push(
        `Node "${nodeId}" could not be lifted off the control path safely; review its wiring.`,
      );
      return;
    }
    edges = edges.filter(
      (edge) => edge.id !== inEdge.id && edge.id !== outEdge.id,
    );
    edges.push({
      id: newEdgeId(),
      source: inEdge.source,
      target: outEdge.target,
      sourceHandle: inEdge.sourceHandle,
      targetHandle: outEdge.targetHandle,
    });
    changed = true;
  };

  for (const nodeId of controlOrder(nodes, edges)) {
    const node = nodeById.get(nodeId);
    if (node === undefined) {
      continue;
    }
    const data = node.data as NodeData;

    switch (node.type) {
      case "ocr": {
        const textVar = data.textVariable;
        const confidenceVar = data.confidenceVariable;
        const matchedVar = data.matchedVariable;
        if (typeof textVar === "string" && textVar.trim().length > 0) {
          lastWriter.set(textVar.trim(), { nodeId, port: "text" });
        }
        if (typeof confidenceVar === "string" && confidenceVar.trim().length > 0) {
          lastWriter.set(confidenceVar.trim(), { nodeId, port: "confidence" });
        }
        if (typeof matchedVar === "string" && matchedVar.trim().length > 0) {
          lastWriter.set(matchedVar.trim(), { nodeId, port: "matched" });
        }
        if (
          "textVariable" in data ||
          "confidenceVariable" in data ||
          "matchedVariable" in data
        ) {
          changed = true;
        }
        delete data.textVariable;
        delete data.confidenceVariable;
        delete data.matchedVariable;
        break;
      }
      case "calculate": {
        const variable = data.variable;
        if (typeof variable === "string" && variable.trim().length > 0) {
          lastWriter.set(variable.trim(), { nodeId, port: "value" });
        }
        delete data.variable;
        if (typeof data.expression === "string") {
          const inputCount =
            typeof data.inputCount === "number" &&
            Number.isInteger(data.inputCount)
              ? Math.max(1, data.inputCount)
              : 2;
          const ownIds = new Set<string>();
          for (let index = 0; index < Math.min(inputCount, 26); index += 1) {
            ownIds.add(flowDynamicPortId(index));
          }
          const external = collectExpressionVariables(data.expression).filter(
            (name) => !ownIds.has(name),
          );
          if (external.length > 0) {
            warnings.push(
              `Calculate node "${nodeId}" expression references variables ${external.join(", ")}; rewrite using a/b/c inputs manually.`,
            );
          }
        }
        if (variable !== undefined) {
          changed = true;
        }
        break;
      }
      case "for": {
        const variable = data.variable;
        if (typeof variable === "string" && variable.trim().length > 0) {
          lastWriter.set(variable.trim(), { nodeId, port: "index" });
        }
        delete data.variable;
        for (const field of ["from", "to", "step"]) {
          const raw = data[field];
          if (typeof raw === "string" && raw.trim().length > 0) {
            const literal = numericLiteral(raw.trim());
            if (literal !== null) {
              data[field] = literal;
              changed = true;
            } else {
              resolveExpressionToPort(nodeId, field, raw);
              delete data[field];
              changed = true;
            }
          }
        }
        break;
      }
      case "compare": {
        bypassControlEdges(nodeId);
        const left = data.left;
        const right = data.right;
        if (typeof left === "string") {
          resolveExpressionToPort(nodeId, "left", left);
        }
        if (typeof right === "string") {
          resolveExpressionToPort(nodeId, "right", right);
        }
        delete data.left;
        delete data.right;
        changed = true;
        break;
      }
      case "if":
      case "while":
      case "assert": {
        const operator = data.operator;
        if (typeof operator === "string" && operator !== "expression" && operator.trim().length > 0) {
          const compareId = newNodeId();
          const compareData: NodeData = { kind: "compare", operator };
          synthesized.push({
            id: compareId,
            type: "compare",
            position: { x: 0, y: 0 },
            data: compareData,
          });
          wire({ nodeId: compareId, port: "result" }, nodeId, "condition");
          resolveExpressionToPort(compareId, "left", asString(data.left));
          resolveExpressionToPort(compareId, "right", asString(data.right));
        } else {
          resolveExpressionToPort(nodeId, "condition", asString(data.condition));
        }
        delete data.operator;
        delete data.left;
        delete data.right;
        delete data.condition;
        changed = true;
        break;
      }
      case "input": {
        if ("paramName" in data) {
          const param: NodeData = {
            name: typeof data.paramName === "string" ? data.paramName : "param",
            dataType: data.dataType ?? "any",
          };
          if (data.defaultValue !== undefined && data.defaultValue !== null) {
            param.defaultValue = data.defaultValue;
          }
          delete data.paramName;
          delete data.dataType;
          delete data.defaultValue;
          data.params = [param];
          changed = true;
        }
        break;
      }
      case "set-variable": {
        const name = data.name;
        const expression = data.expression;
        const expr = typeof expression === "string" ? expression.trim() : "";
        if (name === undefined) {
          warnings.push(
            `Set variable node "${nodeId}" has no name and was left unconverted.`,
          );
          break;
        }
        const vars = collectExpressionVariables(expr);
        if (vars.length === 0) {
          let value: JsonValue = 0;
          try {
            value = evaluateExpression(expr, {});
          } catch {
            warnings.push(
              `Set variable node "${nodeId}" expression "${expr}" could not be evaluated.`,
            );
            value = 0;
          }
          const constantId = addConstant(value);
          bypassControlEdges(nodeId);
          lastWriter.set(String(name), { nodeId: constantId, port: "value" });
          nodes.splice(nodes.indexOf(node), 1);
          changed = true;
        } else {
          const mapping = new Map<string, string>();
          vars.forEach((variable, index) => {
            mapping.set(variable, flowDynamicPortId(index));
          });
          const rewritten = rewriteVariables(expr, mapping);
          node.type = "calculate";
          node.data = {
            kind: "calculate",
            operation: "expression",
            expression: rewritten,
            inputCount: vars.length,
          };
          lastWriter.set(String(name), { nodeId, port: "value" });
          for (const variable of vars) {
            const producer = lastWriter.get(variable);
            if (producer !== undefined) {
              wire(producer, nodeId, mapping.get(variable) as string);
            } else {
              warnings.push(
                `Variable "${variable}" referenced by set-variable "${String(name)}" has no producer.`,
              );
            }
          }
          changed = true;
        }
        break;
      }
      default:
        break;
    }
  }

  const resultNodes = [
    ...nodes,
    ...synthesized.map((node) => ({ ...node })),
  ] as unknown as FlowNode[];
  const resultEdges = [...edges, ...extraEdges];
  return {
    document: {
      schemaVersion: document.schemaVersion,
      nodes: resultNodes,
      edges: resultEdges,
      viewport: document.viewport,
    },
    warnings,
    migrated: changed,
  };
}

function asString(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function rewriteVariables(
  source: string,
  mapping: ReadonlyMap<string, string>,
): string {
  let result = source;
  const names = [...mapping.keys()].sort((a, b) => b.length - a.length);
  for (const name of names) {
    const replacement = mapping.get(name) as string;
    result = result.replace(
      new RegExp(`\\$?${escapeRegExp(name)}\\b`, "g"),
      replacement,
    );
  }
  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
