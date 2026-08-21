import { assert, describe, test } from "vitest";

import {
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
});
