import { eslintCompatPlugin } from "@oxlint/plugins";
import type { Plugin, Rule } from "@oxlint/plugins";

import { noOldRegisteredFunctionSyntax } from "./rules/no-old-registered-function-syntax.js";
import { requireArgsValidator } from "./rules/require-args-validator.js";
import { noImportUseNode } from "./rules/no-import-use-node.js";
import { noFilterInQuery } from "./rules/no-filter-in-query.js";
import { explicitTableIds } from "./rules/explicit-table-ids.js";
import { noCollectInQuery } from "./rules/no-collect-in-query.js";
import { version } from "./version.js";

/**
 * Rule table, keyed exactly as `@convex-dev/eslint-plugin` keys it — including
 * the `import-wrong-runtime` alias for the `no-import-use-node` implementation.
 */
export const rules: Record<string, Rule> = {
  "no-old-registered-function-syntax": noOldRegisteredFunctionSyntax,
  "require-args-validator": requireArgsValidator,
  "import-wrong-runtime": noImportUseNode,
  "explicit-table-ids": explicitTableIds,
  "no-filter-in-query": noFilterInQuery,
  "no-collect-in-query": noCollectInQuery,
};

/**
 * The rule severities `@convex-dev/eslint-plugin`'s `recommended` config
 * applies inside `**\/convex\/**\/*.ts`, copied verbatim.
 */
export const recommendedRules = {
  // This rule is a good idea but bothersome to convert projects to later:
  // it's possible to safely import specific exports from a "use node"
  // file if all Node.js-specific imports are side-effect free.
  "@convex-dev/import-wrong-runtime": "off",
  "@convex-dev/no-old-registered-function-syntax": "error",
  "@convex-dev/require-args-validator": "error",
  "@convex-dev/explicit-table-ids": "error",
  "@convex-dev/no-filter-in-query": "warn",
} as const;

/**
 * The same set minus the two rules that cannot report under oxlint because
 * they need TypeScript type information. Use this to avoid the runtime notice
 * when you have accepted that those two rules stay on ESLint.
 */
export const recommendedRulesOxlintOnly = {
  "@convex-dev/import-wrong-runtime": "off",
  "@convex-dev/no-old-registered-function-syntax": "error",
  "@convex-dev/require-args-validator": "error",
  "@convex-dev/no-filter-in-query": "warn",
} as const;

/** Glob the ESLint `recommended` config scopes its rules to. */
export const CONVEX_FILES = "**/convex/**/*.ts";

/**
 * `meta.name` is what oxlint derives the rule prefix from, so it is
 * `@convex-dev` — giving `@convex-dev/<rule>` ids identical to ESLint's, which
 * also keeps existing `// eslint-disable-next-line @convex-dev/…` comments
 * working.
 */
const plugin: Plugin = eslintCompatPlugin({
  meta: {
    name: "@convex-dev",
    // ESLint plugins conventionally expose their version here; oxlint's
    // `Plugin["meta"]` type only declares `name`, so widen it.
    version,
  } as Plugin["meta"],
  rules,
});

export default plugin;
