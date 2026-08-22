import type { JsonValue } from "./project-contracts";

const MAX_EXPRESSION_LENGTH = 4096;
const MAX_TOKENS = 512;
const MAX_DEPTH = 64;

type TokenKind =
  | "number"
  | "string"
  | "identifier"
  | "operator"
  | "("
  | ")"
  | ","
  | "eof";

interface Token {
  kind: TokenKind;
  text: string;
  value?: JsonValue;
  offset: number;
}

type ExpressionNode =
  | { type: "literal"; value: JsonValue }
  | { type: "variable"; name: string }
  | { type: "unary"; operator: "!" | "+" | "-"; operand: ExpressionNode }
  | {
      type: "binary";
      operator: string;
      left: ExpressionNode;
      right: ExpressionNode;
    }
  | { type: "call"; name: string; args: ExpressionNode[] };

export type ExpressionVariables = Readonly<Record<string, JsonValue>>;

export class ExpressionError extends Error {
  readonly offset: number | null;

  constructor(message: string, offset: number | null = null) {
    super(offset === null ? message : `${message} at character ${offset + 1}.`);
    this.name = "ExpressionError";
    this.offset = offset;
  }
}

const OPERATORS = [
  "===",
  "!==",
  "&&",
  "||",
  "??",
  "<=",
  ">=",
  "==",
  "!=",
  "+",
  "-",
  "*",
  "/",
  "%",
  "<",
  ">",
  "!",
] as const;

function tokenize(source: string): Token[] {
  if (source.length === 0) {
    throw new ExpressionError("Expression cannot be empty");
  }
  if (source.length > MAX_EXPRESSION_LENGTH) {
    throw new ExpressionError(
      `Expression exceeds ${MAX_EXPRESSION_LENGTH} characters`,
    );
  }

  const tokens: Token[] = [];
  let offset = 0;
  const push = (token: Token) => {
    tokens.push(token);
    if (tokens.length > MAX_TOKENS) {
      throw new ExpressionError(`Expression exceeds ${MAX_TOKENS} tokens`);
    }
  };

  while (offset < source.length) {
    const character = source[offset];
    if (/\s/.test(character)) {
      offset += 1;
      continue;
    }
    if (character === "(" || character === ")") {
      push({ kind: character, text: character, offset });
      offset += 1;
      continue;
    }
    if (character === ",") {
      push({ kind: ",", text: ",", offset });
      offset += 1;
      continue;
    }
    if (character === "\"" || character === "'") {
      const quote = character;
      const start = offset;
      offset += 1;
      let value = "";
      let closed = false;
      while (offset < source.length) {
        const current = source[offset++];
        if (current === quote) {
          closed = true;
          break;
        }
        if (current !== "\\") {
          value += current;
          continue;
        }
        if (offset >= source.length) {
          break;
        }
        const escaped = source[offset++];
        const escapes: Record<string, string> = {
          n: "\n",
          r: "\r",
          t: "\t",
          "\\": "\\",
          "\"": "\"",
          "'": "'",
        };
        value += escapes[escaped] ?? escaped;
      }
      if (!closed) {
        throw new ExpressionError("Unterminated string", start);
      }
      push({
        kind: "string",
        text: source.slice(start, offset),
        value,
        offset: start,
      });
      continue;
    }
    if (/\d/.test(character) || (character === "." && /\d/.test(source[offset + 1] ?? ""))) {
      const start = offset;
      const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(
        source.slice(offset),
      );
      if (match === null) {
        throw new ExpressionError("Invalid number", start);
      }
      offset += match[0].length;
      const value = Number(match[0]);
      if (!Number.isFinite(value)) {
        throw new ExpressionError("Number must be finite", start);
      }
      push({ kind: "number", text: match[0], value, offset: start });
      continue;
    }
    if (/[A-Za-z_$]/.test(character)) {
      const start = offset;
      offset += 1;
      while (/[A-Za-z0-9_]/.test(source[offset] ?? "")) {
        offset += 1;
      }
      const text = source.slice(start, offset);
      if (text === "$") {
        throw new ExpressionError("Variable name is missing after $", start);
      }
      push({ kind: "identifier", text, offset: start });
      continue;
    }
    const operator = OPERATORS.find((candidate) =>
      source.startsWith(candidate, offset),
    );
    if (operator !== undefined) {
      push({ kind: "operator", text: operator, offset });
      offset += operator.length;
      continue;
    }
    throw new ExpressionError(`Unexpected character "${character}"`, offset);
  }
  tokens.push({ kind: "eof", text: "", offset: source.length });
  return tokens;
}

class Parser {
  readonly #tokens: Token[];
  #index = 0;
  #depth = 0;

  constructor(tokens: Token[]) {
    this.#tokens = tokens;
  }

  parse(): ExpressionNode {
    const expression = this.#parseNullish();
    const token = this.#peek();
    if (token.kind !== "eof") {
      throw new ExpressionError(`Unexpected token "${token.text}"`, token.offset);
    }
    return expression;
  }

  #peek(): Token {
    return this.#tokens[this.#index];
  }

  #take(): Token {
    return this.#tokens[this.#index++];
  }

  #binary(
    next: () => ExpressionNode,
    operators: readonly string[],
  ): ExpressionNode {
    let left = next();
    while (
      this.#peek().kind === "operator" &&
      operators.includes(this.#peek().text)
    ) {
      const operator = this.#take().text;
      left = { type: "binary", operator, left, right: next() };
    }
    return left;
  }

  #parseNullish = (): ExpressionNode =>
    this.#binary(this.#parseOr, ["??"]);

  #parseOr = (): ExpressionNode => this.#binary(this.#parseAnd, ["||"]);

  #parseAnd = (): ExpressionNode =>
    this.#binary(this.#parseEquality, ["&&"]);

  #parseEquality = (): ExpressionNode =>
    this.#binary(this.#parseComparison, ["==", "!=", "===", "!=="]);

  #parseComparison = (): ExpressionNode =>
    this.#binary(this.#parseAdditive, ["<", "<=", ">", ">="]);

  #parseAdditive = (): ExpressionNode =>
    this.#binary(this.#parseMultiplicative, ["+", "-"]);

  #parseMultiplicative = (): ExpressionNode =>
    this.#binary(this.#parseUnary, ["*", "/", "%"]);

  #parseUnary = (): ExpressionNode => {
    const token = this.#peek();
    if (
      token.kind === "operator" &&
      (token.text === "!" || token.text === "+" || token.text === "-")
    ) {
      this.#take();
      return {
        type: "unary",
        operator: token.text,
        operand: this.#parseUnary(),
      };
    }
    return this.#parsePrimary();
  };

  #parsePrimary(): ExpressionNode {
    const token = this.#take();
    if (token.kind === "number" || token.kind === "string") {
      return { type: "literal", value: token.value as JsonValue };
    }
    if (token.kind === "identifier") {
      if (token.text === "true" || token.text === "false") {
        return { type: "literal", value: token.text === "true" };
      }
      if (token.text === "null") {
        return { type: "literal", value: null };
      }
      const name = token.text.startsWith("$") ? token.text.slice(1) : token.text;
      if (this.#peek().kind === "(") {
        return this.#parseCall(name, token.offset);
      }
      return {
        type: "variable",
        name,
      };
    }
    if (token.kind === "(") {
      this.#depth += 1;
      if (this.#depth > MAX_DEPTH) {
        throw new ExpressionError(`Expression exceeds depth ${MAX_DEPTH}`, token.offset);
      }
      const expression = this.#parseNullish();
      const closing = this.#take();
      this.#depth -= 1;
      if (closing.kind !== ")") {
        throw new ExpressionError("Expected closing parenthesis", closing.offset);
      }
      return expression;
    }
    throw new ExpressionError(
      token.kind === "eof" ? "Expected a value" : `Unexpected token "${token.text}"`,
      token.offset,
    );
  }

  #parseCall(name: string, offset: number): ExpressionNode {
    this.#take();
    this.#depth += 1;
    if (this.#depth > MAX_DEPTH) {
      throw new ExpressionError(`Expression exceeds depth ${MAX_DEPTH}`, offset);
    }
    const args: ExpressionNode[] = [];
    if (this.#peek().kind !== ")") {
      args.push(this.#parseNullish());
      while (this.#peek().kind === ",") {
        this.#take();
        args.push(this.#parseNullish());
      }
    }
    const closing = this.#take();
    this.#depth -= 1;
    if (closing.kind !== ")") {
      throw new ExpressionError("Expected closing parenthesis", closing.offset);
    }
    return { type: "call", name, args };
  }
}

export function expressionTruthy(value: JsonValue): boolean {
  return value !== null && value !== false && value !== 0 && value !== "";
}

function numeric(value: JsonValue, operator: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ExpressionError(`Operator ${operator} requires numeric operands`);
  }
  return value;
}

function compare(left: JsonValue, right: JsonValue, operator: string): boolean {
  if (typeof left === "number" && typeof right === "number") {
    if (operator === "<") return left < right;
    if (operator === "<=") return left <= right;
    if (operator === ">") return left > right;
    return left >= right;
  }
  if (typeof left === "string" && typeof right === "string") {
    if (operator === "<") return left < right;
    if (operator === "<=") return left <= right;
    if (operator === ">") return left > right;
    return left >= right;
  }
  throw new ExpressionError(
    `Operator ${operator} requires two numbers or two strings`,
  );
}

function evaluate(node: ExpressionNode, variables: ExpressionVariables, depth = 0): JsonValue {
  if (depth > MAX_DEPTH) {
    throw new ExpressionError(`Expression exceeds evaluation depth ${MAX_DEPTH}`);
  }
  if (node.type === "literal") {
    return node.value;
  }
  if (node.type === "variable") {
    if (!Object.hasOwn(variables, node.name)) {
      throw new ExpressionError(`Variable "${node.name}" is not defined`);
    }
    return variables[node.name];
  }
  if (node.type === "call") {
    return evaluateCall(
      node.name,
      node.args.map((argument) => evaluate(argument, variables, depth + 1)),
    );
  }
  if (node.type === "unary") {
    const value = evaluate(node.operand, variables, depth + 1);
    if (node.operator === "!") return !expressionTruthy(value);
    const number = numeric(value, node.operator);
    return node.operator === "-" ? -number : number;
  }

  const left = evaluate(node.left, variables, depth + 1);
  if (node.operator === "&&") {
    return expressionTruthy(left)
      ? evaluate(node.right, variables, depth + 1)
      : left;
  }
  if (node.operator === "||") {
    return expressionTruthy(left)
      ? left
      : evaluate(node.right, variables, depth + 1);
  }
  if (node.operator === "??") {
    return left === null ? evaluate(node.right, variables, depth + 1) : left;
  }
  const right = evaluate(node.right, variables, depth + 1);
  switch (node.operator) {
    case "==":
    case "===":
      return left === right;
    case "!=":
    case "!==":
      return left !== right;
    case "<":
    case "<=":
    case ">":
    case ">=":
      return compare(left, right, node.operator);
    case "+":
      if (typeof left === "string" || typeof right === "string") {
        if (
          (typeof left !== "string" && typeof left !== "number" && typeof left !== "boolean") ||
          (typeof right !== "string" && typeof right !== "number" && typeof right !== "boolean")
        ) {
          throw new ExpressionError("String concatenation requires primitive operands");
        }
        return String(left) + String(right);
      }
      return numeric(left, "+") + numeric(right, "+");
    case "-":
      return numeric(left, "-") - numeric(right, "-");
    case "*":
      return numeric(left, "*") * numeric(right, "*");
    case "/": {
      const divisor = numeric(right, "/");
      if (divisor === 0) throw new ExpressionError("Division by zero");
      return numeric(left, "/") / divisor;
    }
    case "%": {
      const divisor = numeric(right, "%");
      if (divisor === 0) throw new ExpressionError("Modulo by zero");
      return numeric(left, "%") % divisor;
    }
    default:
      throw new ExpressionError(`Unsupported operator ${node.operator}`);
  }
}

export type AggregateOperation = "max" | "min" | "sum" | "avg" | "count";

function functionError(name: string, message: string): ExpressionError {
  return new ExpressionError(`Function ${name} ${message}`);
}

function requireArguments(name: string, args: JsonValue[], count: number): void {
  if (args.length !== count) {
    throw functionError(
      name,
      `requires exactly ${count} argument${count === 1 ? "" : "s"}, got ${args.length}`,
    );
  }
}

function numericArgument(name: string, value: JsonValue): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw functionError(name, "requires a numeric argument");
  }
  return value;
}

function stringArgument(name: string, value: JsonValue): string {
  if (typeof value !== "string") {
    throw functionError(name, "requires a string argument");
  }
  return value;
}

function parseNumericString(name: string, value: string): number {
  let text = value.trim().replace(/[$€£¥\s]/g, "");
  if (text.endsWith("%")) {
    text = text.slice(0, -1).trim();
  }
  if (text.length === 0) {
    throw functionError(name, "cannot convert an empty string to a number");
  }
  const hasComma = text.includes(",");
  const hasDot = text.includes(".");
  let normalized: string;
  if (hasComma && hasDot) {
    normalized =
      text.lastIndexOf(".") > text.lastIndexOf(",")
        ? text.replace(/,/g, "")
        : text.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    const commas = text.match(/,/g)?.length ?? 0;
    const trailing = text.slice(text.lastIndexOf(",") + 1);
    normalized =
      commas === 1 && trailing.length !== 3
        ? text.replace(",", ".")
        : text.replace(/,/g, "");
  } else {
    normalized = text;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw functionError(name, `cannot convert "${value}" to a number`);
  }
  return parsed;
}

function coerceNumber(name: string, value: JsonValue): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw functionError(name, "requires a finite number");
    }
    return value;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (typeof value === "string") {
    return parseNumericString(name, value);
  }
  throw functionError(name, "cannot convert the given value to a number");
}

function coerceString(name: string, value: JsonValue): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null) {
    return "";
  }
  throw functionError(name, "cannot convert the given value to a string");
}

export type CastTarget = "number" | "int" | "string" | "boolean";

export function castValue(target: CastTarget, value: JsonValue): JsonValue {
  switch (target) {
    case "number":
      return coerceNumber("number", value);
    case "int":
      return Math.trunc(coerceNumber("int", value));
    case "string":
      return coerceString("string", value);
    case "boolean":
      return expressionTruthy(value);
  }
}

export function aggregateValues(
  operation: AggregateOperation,
  values: JsonValue[],
): number {
  if (operation === "count") {
    return values.length;
  }
  if (values.length === 0) {
    throw functionError(operation, "requires at least one argument");
  }
  const numbers = values.map((value) => numericArgument(operation, value));
  const total = numbers.reduce((sum, value) => sum + value, 0);
  switch (operation) {
    case "max":
      return Math.max(...numbers);
    case "min":
      return Math.min(...numbers);
    case "sum":
      return total;
    case "avg":
      return total / numbers.length;
    default:
      throw functionError(operation, "is not a supported aggregate operation");
  }
}

function evaluateCall(name: string, args: JsonValue[]): JsonValue {
  switch (name) {
    case "max":
    case "min":
    case "sum":
    case "avg":
    case "count":
      return aggregateValues(name, args);
    case "abs":
      requireArguments(name, args, 1);
      return Math.abs(numericArgument(name, args[0]));
    case "round":
      requireArguments(name, args, 1);
      return Math.round(numericArgument(name, args[0]));
    case "floor":
      requireArguments(name, args, 1);
      return Math.floor(numericArgument(name, args[0]));
    case "ceil":
      requireArguments(name, args, 1);
      return Math.ceil(numericArgument(name, args[0]));
    case "number":
    case "int":
    case "string":
    case "boolean":
      requireArguments(name, args, 1);
      return castValue(name, args[0]);
    case "len": {
      requireArguments(name, args, 1);
      const value = args[0];
      if (typeof value === "string" || Array.isArray(value)) {
        return value.length;
      }
      throw functionError(name, "requires a string or array argument");
    }
    case "trim":
      requireArguments(name, args, 1);
      return stringArgument(name, args[0]).trim();
    case "lower":
      requireArguments(name, args, 1);
      return stringArgument(name, args[0]).toLowerCase();
    case "upper":
      requireArguments(name, args, 1);
      return stringArgument(name, args[0]).toUpperCase();
    case "contains": {
      requireArguments(name, args, 2);
      const haystack = args[0];
      const needle = args[1];
      if (typeof haystack === "string" && typeof needle === "string") {
        return haystack.includes(needle);
      }
      if (Array.isArray(haystack)) {
        return haystack.some((item) => item === needle);
      }
      throw functionError(name, "requires a string or array first argument");
    }
    case "startsWith":
    case "endsWith": {
      requireArguments(name, args, 2);
      const value = stringArgument(name, args[0]);
      const part = stringArgument(name, args[1]);
      return name === "startsWith"
        ? value.startsWith(part)
        : value.endsWith(part);
    }
    case "replace": {
      requireArguments(name, args, 3);
      const value = stringArgument(name, args[0]);
      const search = stringArgument(name, args[1]);
      const replacement = stringArgument(name, args[2]);
      return value.split(search).join(replacement);
    }
    default:
      throw new ExpressionError(`Unknown function "${name}"`);
  }
}

export function evaluateExpression(
  source: string,
  variables: ExpressionVariables = {},
): JsonValue {
  const ast = new Parser(tokenize(source.trim())).parse();
  const value = evaluate(ast, variables);
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new ExpressionError("Expression result must be finite");
  }
  return value;
}
