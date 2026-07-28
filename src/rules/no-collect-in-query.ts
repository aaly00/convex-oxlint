import type { Rule } from "@oxlint/plugins";
import { docsUrl } from "../util.js";
import {
  hasTypeInformation,
  noticeTypeAwareRuleIsInert,
} from "../type-aware-notice.js";

/**
 * Rule to discourage calling `.collect()` on Convex queries.
 *
 * TYPE-AWARE RULE — INERT UNDER OXLINT.
 *
 * The ESLint implementation requires parser services twice over: once for the
 * usual `services?.program` guard, and again to resolve the `OrderedQuery` type
 * out of the `convex` package — if that lookup fails it returns an empty
 * visitor "to avoid false positives". Every report is gated on
 * `checker.isTypeAssignableTo(receiverType, OrderedQuery)`.
 *
 * Oxlint provides no parser services, so this rule reports nothing, exactly as
 * the ESLint rule does when type-aware linting is off. See PARITY.md.
 */
export const noCollectInQuery: Rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow calling `.collect()` on Convex queries; prefer `.take()` or `.paginate()` instead.",
      url: docsUrl("no-collect-in-query"),
    },
    schema: [],
    hasSuggestions: true,
    messages: {
      "no-collect-in-query":
        "Avoid calling `.collect()` in a Convex query: it can fail for large datasets. Prefer `.take()` or `.paginate()` instead (see the best practices docs). If you are certain that this call to `.collect()` won’t reach the [Convex query limits](https://docs.convex.dev/production/state/limits), you can disable this line with `// eslint-disable-next-line @convex-dev/no-collect-in-query`.",
      "replace-with-take": "Replace `.collect()` with `.take()`.",
      "replace-with-paginate": "Replace `.collect()` with `.paginate()`.",
    },
  },
  createOnce(context) {
    return {
      before() {
        // See explicit-table-ids for why the notice lives in `before` and why
        // the no-op `Program` handler below is required.
        noticeTypeAwareRuleIsInert(
          "no-collect-in-query",
          hasTypeInformation(context.sourceCode.parserServices),
        );
        return false;
      },
      Program() {},
    };
  },
};
