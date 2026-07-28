import {
  CONVEX_FILES,
  recommendedRules,
  recommendedRulesOxlintOnly,
} from "./index.js";

/**
 * Oxlint config fragments, for use from `oxlint.config.ts`:
 *
 * ```ts
 * import { defineConfig } from "oxlint";
 * import { recommended } from "convex-oxlint/configs";
 *
 * export default defineConfig({ extends: [recommended] });
 * ```
 *
 * For `.oxlintrc.json`, extend the shipped JSON presets instead:
 *
 * ```json
 * { "extends": ["./node_modules/convex-oxlint/oxlintrc.recommended.json"] }
 * ```
 */

/** 1:1 mirror of `@convex-dev/eslint-plugin`'s `recommended` config. */
export const recommended = {
  jsPlugins: ["convex-oxlint"],
  overrides: [{ files: [CONVEX_FILES], rules: { ...recommendedRules } }],
};

/**
 * `recommended` minus `explicit-table-ids` and `no-collect-in-query`, the two
 * rules that need TypeScript type information and therefore cannot report
 * under oxlint. Enabling them changes no diagnostics; it only prints a notice.
 */
export const recommendedOxlintOnly = {
  jsPlugins: ["convex-oxlint"],
  overrides: [
    { files: [CONVEX_FILES], rules: { ...recommendedRulesOxlintOnly } },
  ],
};

export default { recommended, recommendedOxlintOnly };
