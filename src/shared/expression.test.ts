import { assert, describe, test } from "vitest";

import {
  aggregateValues,
  ExpressionError,
  evaluateExpression,
  expressionTruthy,
} from "./expression";

describe("safe flow expressions", () => {
  test("evaluates precedence, variables, comparisons, and boolean operators", () => {
    assert.equal(evaluateExpression("1 + 2 * 3"), 7);
    assert.equal(evaluateExpression("(1 + 2) * 3"), 9);
    assert.equal(evaluateExpression("$count >= 3 && enabled", {
      count: 3,
      enabled: true,
    }), true);
    assert.equal(evaluateExpression("missing ?? 4", { missing: null }), 4);
  });

  test("short-circuits branches and concatenates primitive strings", () => {
    assert.equal(evaluateExpression("false && unknown"), false);
    assert.equal(evaluateExpression("true || unknown"), true);
    assert.equal(evaluateExpression("'item-' + 3"), "item-3");
  });

  test("rejects unsafe syntax, missing variables, invalid math, and deep input", () => {
    assert.throws(() => evaluateExpression("process.exit()"), ExpressionError);
    assert.throws(() => evaluateExpression("unknown + 1"), /not defined/);
    assert.throws(() => evaluateExpression("1 / 0"), /Division by zero/);
    assert.throws(() => evaluateExpression("(".repeat(65) + "1" + ")".repeat(65)), /depth/);
  });

  test("uses explicit JSON truthiness", () => {
    assert.equal(expressionTruthy(null), false);
    assert.equal(expressionTruthy(0), false);
    assert.equal(expressionTruthy(""), false);
    assert.equal(expressionTruthy([]), true);
    assert.equal(expressionTruthy({}), true);
  });

  test("evaluates built-in aggregate, math, and string functions", () => {
    assert.equal(evaluateExpression("max(3, 9, 6)"), 9);
    assert.equal(evaluateExpression("min(3, 9, 6)"), 3);
    assert.equal(evaluateExpression("sum(1, 2, 3, 4)"), 10);
    assert.equal(evaluateExpression("avg(1, 2, 3, 4)"), 2.5);
    assert.equal(evaluateExpression("count(1, 2, 3)"), 3);
    assert.equal(evaluateExpression("abs(-5)"), 5);
    assert.equal(evaluateExpression("round(2.6)"), 3);
    assert.equal(evaluateExpression("floor(2.9)"), 2);
    assert.equal(evaluateExpression("ceil(2.1)"), 3);
    assert.equal(evaluateExpression("len('hello')"), 5);
    assert.equal(evaluateExpression("contains('hello', 'ell')"), true);
    assert.equal(evaluateExpression("trim('  hi  ')"), "hi");
    assert.equal(evaluateExpression("lower('ABC')"), "abc");
    assert.equal(evaluateExpression("upper('abc')"), "ABC");
    assert.equal(evaluateExpression("startsWith('hello', 'he')"), true);
    assert.equal(evaluateExpression("endsWith('hello', 'lo')"), true);
    assert.equal(evaluateExpression("replace('a-b-c', '-', '_')"), "a_b_c");
  });

  test("supports nested function calls and variable arguments", () => {
    assert.equal(evaluateExpression("max(min(1, 2), avg(10, 20))"), 15);
    assert.equal(evaluateExpression("sum($a, $b)", { a: 2, b: 3 }), 5);
  });

  test("rejects unknown functions and invalid function usage", () => {
    assert.throws(() => evaluateExpression("nope(1)"), /Unknown function/);
    assert.throws(() => evaluateExpression("abs(1, 2)"), /exactly 1 argument/);
    assert.throws(() => evaluateExpression("max('a', 'b')"), /numeric/);
    assert.throws(() => evaluateExpression("max()"), /at least one argument/);
  });

  test("aggregates arrays through the shared aggregate helper", () => {
    assert.equal(aggregateValues("count", [1, 2, 3]), 3);
    assert.equal(aggregateValues("max", [1, 5, 3]), 5);
    assert.equal(aggregateValues("min", [1, 5, 3]), 1);
    assert.equal(aggregateValues("sum", [1, 2, 3]), 6);
    assert.equal(aggregateValues("avg", [1, 2, 3, 4]), 2.5);
  });
});
