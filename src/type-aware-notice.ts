/**
 * `@convex-dev/explicit-table-ids` and `@convex-dev/no-collect-in-query` are
 * type-aware rules: the ESLint plugin bails out and reports nothing unless the
 * TypeScript program is reachable through `context.sourceCode.parserServices`.
 *
 * Oxlint does not expose parser services to JS plugins (verified against
 * oxlint 1.76.0, including `--type-aware` with `oxlint-tsgolint` installed), so
 * these rules can never report under oxlint. That matches ESLint exactly when
 * type-aware linting is off, and is a silent false negative when it is on —
 * so we say so once, out loud, on stderr.
 *
 * Set `CONVEX_OXLINT_SILENCE_TYPE_AWARE_NOTICE=1` to suppress.
 */
const notified = new Set<string>();

/**
 * @param ruleName rule that is enabled but cannot report
 * @param typeInformationAvailable result of {@link hasTypeInformation}; when
 *   `true` the host does expose a TypeScript program (ESLint with type-aware
 *   linting, or a future oxlint), and the message says so instead of claiming
 *   the rule is inert.
 */
export function noticeTypeAwareRuleIsInert(
  ruleName: string,
  typeInformationAvailable = false,
): void {
  if (process.env.CONVEX_OXLINT_SILENCE_TYPE_AWARE_NOTICE) return;
  if (notified.has(ruleName)) return;
  notified.add(ruleName);

  const detail = typeInformationAvailable
    ? `type information IS available in this host, but this port does not implement the type-aware analysis — ` +
      `run "@convex-dev/${ruleName}" through @convex-dev/eslint-plugin instead`
    : `it requires TypeScript type information, which oxlint does not provide to JS plugins; ` +
      `keep running this rule under ESLint with type-aware linting enabled`;

  process.stderr.write(
    `[convex-oxlint] "@convex-dev/${ruleName}" is enabled but cannot report under oxlint: ` +
      `${detail}. ` +
      `See https://github.com/aaly00/convex-oxlint/blob/main/PARITY.md for details. ` +
      `(Silence with CONVEX_OXLINT_SILENCE_TYPE_AWARE_NOTICE=1.)\n`,
  );
}

/**
 * Mirrors the ESLint plugin's availability probe so that the moment oxlint
 * starts providing parser services, this returns `true` and the failure mode
 * changes from "inert" to "needs a real implementation".
 */
export function hasTypeInformation(parserServices: unknown): boolean {
  const services = parserServices as
    | {
        program?: unknown;
        esTreeNodeToTSNodeMap?: { get?: unknown };
      }
    | undefined
    | null;
  return !!(
    services?.program &&
    services.esTreeNodeToTSNodeMap &&
    typeof services.esTreeNodeToTSNodeMap.get === "function"
  );
}
