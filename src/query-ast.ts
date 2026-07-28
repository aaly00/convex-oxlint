import type { Expression } from "./ast.js";

/**
 * Query methods that end a Convex query chain. Ported verbatim from
 * `@convex-dev/eslint-plugin`'s `no-filter-in-query` rule.
 */
export const TERMINAL_QUERY_METHODS = new Set([
  "collect",
  "take",
  "first",
  "unique",
  "paginate",
]);

export function unwrapExpression(expr: Expression): Expression {
  let current: Expression = expr;
  while (true) {
    // ignore `?` (e.g. `a?.b`)
    if (current.type === "ChainExpression") {
      current = current.expression as Expression;
      continue;
    }

    // ignore `await`
    if (current.type === "AwaitExpression") {
      current = current.argument;
      continue;
    }

    // ignore `!`
    if (current.type === "TSNonNullExpression") {
      current = current.expression;
      continue;
    }

    // ignore `as`
    if (current.type === "TSAsExpression") {
      current = current.expression;
      continue;
    }

    // ignore `<Type>` in `<Type>value`
    if (current.type === "TSTypeAssertion") {
      current = current.expression;
      continue;
    }

    // Ignore generic arguments (e.g. `<T>` in `fn<T>()`)
    if (current.type === "TSInstantiationExpression") {
      current = current.expression;
      continue;
    }

    // Ignore parentheses
    const anyCurrent = current as { type: string; expression?: Expression };
    if (anyCurrent.type === "ParenthesizedExpression") {
      current = anyCurrent.expression as Expression;
      continue;
    }
    return current;
  }
}

// Whether the node is a call to a function that collects a query
export function isTerminalQueryCall(expr: Expression): boolean {
  const unwrapped = unwrapExpression(expr);
  if (unwrapped.type !== "CallExpression") return false;

  const callee = unwrapped.callee;
  if (callee.type !== "MemberExpression") return false;
  if (callee.property.type !== "Identifier") return false;
  return TERMINAL_QUERY_METHODS.has(callee.property.name);
}

export function isDbQueryChainFallback(expr: Expression): boolean {
  const unwrapped = unwrapExpression(expr);
  if (unwrapped.type !== "CallExpression") return false;

  const callee = unwrapped.callee;
  if (callee.type !== "MemberExpression") return false;
  if (callee.property.type !== "Identifier") return false;

  const methodName = callee.property.name;
  if (TERMINAL_QUERY_METHODS.has(methodName)) {
    // `db.query(...).collect()` and friends return arrays / values, not a query builder.
    return false;
  }

  if (methodName === "query") {
    const baseObject = unwrapExpression(callee.object as Expression);
    // `ctx.db.query(...)`
    if (
      baseObject.type === "MemberExpression" &&
      baseObject.property.type === "Identifier" &&
      baseObject.property.name === "db"
    ) {
      return true;
    }
    // `db.query(...)` (DatabaseReader / DatabaseWriter passed around)
    if (baseObject.type === "Identifier" && baseObject.name === "db") {
      return true;
    }
    // `db.privateSystem.query(...)` (system UDFs)
    if (
      baseObject.type === "MemberExpression" &&
      baseObject.property.type === "Identifier" &&
      baseObject.property.name === "privateSystem"
    ) {
      const innerObject = unwrapExpression(baseObject.object as Expression);
      if (innerObject.type === "Identifier" && innerObject.name === "db") {
        return true;
      }
      if (
        innerObject.type === "MemberExpression" &&
        innerObject.property.type === "Identifier" &&
        innerObject.property.name === "db"
      ) {
        return true;
      }
    }
    return false;
  }

  // Continue walking down chained calls like `.withIndex(...)`, `.order(...)`, etc.
  return isDbQueryChainFallback(callee.object as Expression);
}
