import type { Rule } from "@oxlint/plugins";
import { docsUrl } from "../util.js";
import {
  hasTypeInformation,
  noticeTypeAwareRuleIsInert,
} from "../type-aware-notice.js";

/**
 * Rule to enforce explicit table names in database calls
 * (db.get, db.replace, db.patch, db.delete)
 *
 * TYPE-AWARE RULE — INERT UNDER OXLINT.
 *
 * The ESLint implementation opens with:
 *
 * ```js
 * const services = context.sourceCode.parserServices;
 * if (!services?.program || !services.esTreeNodeToTSNodeMap || ...) return {};
 * ```
 *
 * and then drives a TypeScript `TypeChecker` to decide whether the receiver is
 * a `DatabaseReader`/`DatabaseWriter` and to read the table name out of the
 * `Id<"table">` type alias. Neither is expressible without a type checker.
 *
 * Oxlint provides no parser services, so the ESLint rule's own guard is what
 * runs here: an empty visitor. Under ESLint *without* type-aware linting this
 * rule likewise reports nothing, so behavior is identical. Under ESLint *with*
 * type-aware linting it does report, and that difference is flagged loudly at
 * runtime and in PARITY.md.
 */
export const explicitTableIds: Rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Database operations should include an explicit table name as the first argument.",
      url: docsUrl("explicit-table-ids"),
    },
    messages: {
      "missing-table-name":
        "Database {{method}} call should include an explicit table name as the first argument. Expected: db.{{method}}({{tableName}}, ...) ",
      "missing-table-name-no-inference":
        "Database {{method}} call should include an explicit table name as the first argument. Expected: db.{{method}}(<tableName>, ...).",
    },
    schema: [],
    fixable: "code",
  },
  createOnce(context) {
    return {
      before() {
        // Oxlint calls `createOnce` for every rule in the plugin, enabled or
        // not, but only calls `before` for rules that are actually switched on
        // — which makes this the right place to warn. Returning `false` skips
        // the file, so no traversal happens.
        noticeTypeAwareRuleIsInert(
          "explicit-table-ids",
          hasTypeInformation(context.sourceCode.parserServices),
        );
        return false;
      },
      // Oxlint skips a rule entirely when its visitor registers no node
      // handlers, and skipping it would also skip `before` above. This no-op
      // handler exists only so the notice is reachable; `before` returning
      // `false` means it never runs.
      Program() {},
    };
  },
};
