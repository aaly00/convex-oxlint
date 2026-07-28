import type { Rule } from "@oxlint/plugins";
import type { CallExpression, Expression, MemberExpression } from "../ast.js";
import { docsUrl } from "../util.js";
import { isDbQueryChainFallback, isTerminalQueryCall } from "../query-ast.js";

/**
 * Warn when using `.filter()` on a Convex database query.
 *
 * The ESLint plugin prefers type information when it is available and falls
 * back to AST pattern matching otherwise. Oxlint exposes no parser services to
 * JS plugins, so this port implements the AST fallback path, which is exactly
 * what the ESLint rule executes when type-aware linting is off.
 */
export const noFilterInQuery: Rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Warn when using `.filter()` on a Convex database query, since it can be inefficient.",
      url: docsUrl("no-filter-in-query"),
    },
    messages: {
      "no-filter-in-query":
        "Avoid calling `.filter()` on a Convex database query; it can be inefficient (see Convex query best practices). If you have a real reason to use it, disable with `// eslint-disable-next-line @convex-dev/no-filter-in-query`.",
    },
    schema: [],
  },
  createOnce(context) {
    return {
      before() {
        return !context.filename.includes("_generated");
      },

      // Matches both `x.filter(...)` and the computed `x[filter](...)`, which
      // is what the ESLint rule's `property.type === "Identifier"` check does.
      'CallExpression[callee.type="MemberExpression"][callee.property.name="filter"]'(
        node: CallExpression,
      ) {
        const memberExpr = node.callee as MemberExpression;
        const receiver = memberExpr.object as Expression;

        // Don’t warn for array `.filter()` after running a query, e.g.
        // `(await db.query(...).collect()).filter(...)`.
        if (isTerminalQueryCall(receiver)) return;

        if (isDbQueryChainFallback(receiver)) {
          context.report({
            node: memberExpr.property,
            messageId: "no-filter-in-query",
          });
        }
      },
    };
  },
};
