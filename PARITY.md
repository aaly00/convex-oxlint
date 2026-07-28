# Parity report

This package is a port of [`@convex-dev/eslint-plugin`][upstream] **v2.0.0** to
[oxlint][oxlint]. This document states exactly where it is identical, exactly
where it is not, and how each claim is verified.

Every claim below is backed by an executable test. Run `npm test` to re-check
all of them against the real `@convex-dev/eslint-plugin` and the real `oxlint`
binary.

- Ported from: `@convex-dev/eslint-plugin@2.0.0` (the published npm artifact,
  not the repository's `main` branch — see [Version targeting](#version-targeting))
- Verified against: `oxlint@1.76.0`, `eslint@9.39.0`,
  `@typescript-eslint/parser@8.58.0`

---

## Summary

| | Rule | vs ESLint **without** type-aware linting | vs ESLint **with** type-aware linting |
|---|---|---|---|
| ✅ | `@convex-dev/no-old-registered-function-syntax` | Identical | Identical |
| ✅ | `@convex-dev/require-args-validator` | Identical | Identical |
| ✅ | `@convex-dev/import-wrong-runtime` | Identical | Identical |
| ⚠️ | `@convex-dev/no-filter-in-query` | Identical | **Under-reports** — see [D3](#d3-no-filter-in-query-loses-its-type-aware-detections) |
| ⛔ | `@convex-dev/explicit-table-ids` | Identical (both report nothing) | **Reports nothing** — see [D1](#d1-explicit-table-ids-cannot-run) |
| ⛔ | `@convex-dev/no-collect-in-query` | Identical (both report nothing) | **Reports nothing** — see [D2](#d2-no-collect-in-query-cannot-run) |

**If you do not use type-aware ESLint linting** (no `parserOptions.project` or
`projectService`), this package is a complete drop-in replacement: every
diagnostic, message, severity, source span, autofix and suggestion is identical.

**If you do use type-aware ESLint linting**, three rules lose detections. Keep
those rules on ESLint, or accept the gap knowingly. The package prints a
runtime notice rather than failing silently.

---

## Root cause of every deviation

There is exactly one: **oxlint does not expose parser services to JS plugins.**

`context.sourceCode.parserServices` is always `{}`. This is not a configuration
problem — it stays `{}` even with `--type-aware` and `oxlint-tsgolint`
installed, because oxlint's type-aware engine serves its built-in Rust rules,
not JS plugins. Oxlint's own type definitions say so outright: *"Oxlint does not
offer any parser services."*

Verified by `test/parity/capabilities.test.ts`, which runs a probe plugin under
oxlint both with and without `--type-aware` and asserts the services object is
empty. If oxlint ever changes this, that test fails and the affected rules must
be implemented for real.

Everything else about oxlint matches ESLint closely enough to be invisible:

| Capability | Status | Evidence |
|---|---|---|
| AST shape | Identical to `@typescript-eslint/parser` | `tools/astdiff/compare.mjs` — 0 structural differences over a TS/TSX/BOM/CRLF/edge-syntax corpus, byte-exact `range` on every node |
| Rule ids | `@convex-dev/<rule>`, same as ESLint | `capabilities.test.ts` |
| `eslint-disable*` comments | Honoured | `directives-and-presets.test.ts` |
| `context.filename` | Absolute path, as ESLint | `capabilities.test.ts` |
| Fixes | Byte-identical output | `fixes.test.ts` |
| Rule options and defaults | Identical | `diagnostics.test.ts` |
| Scope manager | Present | `capabilities.test.ts` |

---

## Deviations

### D1: `explicit-table-ids` cannot run

**Severity in the upstream `recommended` config: `error`.**

The ESLint rule begins by bailing out when type information is unavailable:

```js
const services = context.sourceCode.parserServices;
if (!services?.program || !services.esTreeNodeToTSNodeMap || …) return {};
```

Past that guard it drives a TypeScript `TypeChecker` to decide whether a
receiver is assignable to `DatabaseReader`/`DatabaseWriter`, and reads the table
name out of the `Id<"table">` type alias' `aliasTypeArguments`. Neither step has
an AST equivalent.

**Under oxlint this rule reports nothing.** That is *identical* to ESLint
without type-aware linting — the upstream rule reports nothing there either.
Against type-aware ESLint, every diagnostic is lost.

Measured on the typed fixture project in `test/fixtures/typed`: **5 lost
diagnostics** (`ctx.db.get`, `.patch`, `.replace`, `.delete` calls missing an
explicit table name), plus their autofixes.

### D2: `no-collect-in-query` cannot run

**Not enabled in the upstream `recommended` config** (available opt-in).

Same root cause, twice over: the rule needs parser services, *and* it resolves
the `OrderedQuery` type from the `convex` package, returning an empty visitor
when that lookup fails "to avoid false positives". Every report is gated on
`checker.isTypeAssignableTo(receiverType, OrderedQuery)`.

**Under oxlint this rule reports nothing**, identical to non-type-aware ESLint.
Measured on the typed fixture: **4 lost diagnostics**, plus the two
`take()` / `paginate()` suggestions attached to each.

### D3: `no-filter-in-query` loses its type-aware detections

**Severity in the upstream `recommended` config: `warn`.**

This rule differs from D1/D2: upstream it has *two* code paths. It prefers type
information and falls back to AST pattern matching when there is none. This port
implements the AST fallback, which is precisely what upstream ESLint executes
when type-aware linting is off — so the two agree exactly in that configuration.

With type information, upstream additionally recognises Convex query builders
the AST cannot see. Measured on `test/fixtures/typed/convex/filters.ts`:

| Pattern | AST fallback (this port) | Type-aware ESLint |
|---|---|---|
| `ctx.db.query("m").filter(…)` | ✅ reported | ✅ reported |
| `ctx.db.query("m").withIndex(…).order(…).filter(…)` | ✅ reported | ✅ reported |
| `const q = ctx.db.query("m"); q.filter(…)` | ❌ missed | ✅ reported |
| `const reader: DatabaseReader = ctx.db; reader.query("m").filter(…)` | ❌ missed | ✅ reported |
| `const build = () => ctx.db.query("m"); build().filter(…)` | ❌ missed | ✅ reported |
| `(await ctx.db.query("m").collect()).filter(…)` (array filter) | ✅ not reported | ✅ not reported |
| `[1,2,3].filter(…)` | ✅ not reported | ✅ not reported |

All misses are **false negatives**, never false positives. This port never
reports something ESLint would not.

Pinned by `test/parity/type-aware-deviations.test.ts`, which asserts the exact
line:column sets on both sides.

---

## Non-deviations worth knowing about

These are toolchain-level differences between running `eslint` and running
`oxlint`. They are not caused by this package and apply to any oxlint
migration, but they change what appears on your terminal.

### Unused disable directives

ESLint 9 defaults `linterOptions.reportUnusedDisableDirectives` to `"warn"`.
Oxlint defaults its equivalent off. Turn it on in `.oxlintrc.json` if you rely
on it:

```json
{ "options": { "reportUnusedDisableDirectives": "warn" } }
```

The parity suites pin this setting on both sides so it cannot mask a real
difference.

### `.js` / `.cjs` files containing TypeScript syntax

`@typescript-eslint/parser` will parse TypeScript syntax in a `.js` file;
oxlint parses `.js` as JavaScript and `.cjs` as CommonJS. A `.cjs` file
containing `export` is a syntax error to oxlint and accepted by ESLint. This
affects parsing, not rule behavior.

### Diagnostic output format

Oxlint spells rule ids `@convex-dev(no-filter-in-query)` in its own output
formats and reports byte offsets and byte columns; ESLint spells them
`@convex-dev/no-filter-in-query` and reports UTF-16 columns. The underlying
source spans are the same — the parity harness converts between the two and
asserts equality, including on non-ASCII source.

### Type-aware notice

When `explicit-table-ids` or `no-collect-in-query` is enabled, this package
writes one line per rule to **stderr** explaining that it cannot report. This
never touches stdout, so `--format json` output stays machine-parseable.
Silence it with `CONVEX_OXLINT_SILENCE_TYPE_AWARE_NOTICE=1`, or use the
`recommended-oxlint-only` preset, which omits those rules.

---

## Version targeting

The published `@convex-dev/eslint-plugin@2.0.0` npm artifact is the reference,
not `convex-backend@main`. At the time of writing, the repository's `main` is
*ahead* of the 2.0.0 release: its `CHANGELOG.md` has an "Unreleased" section
stating that `no-collect-in-query` and `explicit-table-ids` "now work when
type-aware linting is disabled", and it contains a `src/lib/query-ast.ts` that
is not present in the shipped 2.0.0 `dist/`.

That upstream work will add AST fallbacks to the two rules that are inert here.
When it ships, D1 and D2 become implementable and this port should be updated to
match. Until then, the shipped artifact is what users actually install, and it
is what this package is verified against.

---

## How parity is verified

`npm test` runs 76 tests across eight suites. Every parity suite executes the
**real** `@convex-dev/eslint-plugin` through the **real** ESLint API and the
**real** `oxlint` binary over the same files, then compares normalized
diagnostics — rule id, severity, interpolated message text, and start/end
line:column — as multisets.

| Suite | What it proves |
|---|---|
| `diagnostics.test.ts` | 1127 diagnostics over an 81-file combinatorial corpus match exactly: at error severity, at warn severity, per-rule in isolation, and across every `require-args-validator` option combination |
| `fixes.test.ts` | `eslint --fix` and `oxlint --fix` produce byte-identical files |
| `fuzz.test.ts` | 460 randomly generated programs (seeded, reproducible) match exactly |
| `directives-and-presets.test.ts` | `eslint-disable` handling, the shipped JSON preset vs upstream's `configs.recommended`, and rule metadata (messages, schema, fixability, docs URLs) |
| `type-aware-deviations.test.ts` | The deviations above, pinned to exact line:column sets |
| `capabilities.test.ts` | The oxlint capability claims this port depends on |
| `packaged.test.ts` | The actual npm tarball, installed into a clean project |
| `unit/util.test.ts` | `isEntryPoint` gating semantics |

The corpus is generated by `test/fixtures/generate.mjs` and covers every
registrar × argument shape × export form combination, 40 `.filter()` receiver
shapes, every declarator shape that must *not* match (no initializer,
destructuring, `new`, optional and non-identifier callees, class fields), all `isEntryPoint` gating cases, a `"use node"` import graph, and
Unicode/BOM/CRLF sources.

Separately, `tools/astdiff/compare.mjs` diffs oxlint's AST against
`@typescript-eslint/parser`'s node by node to confirm the rules see the same
tree.

[upstream]: https://github.com/get-convex/convex-backend/tree/main/npm-packages/%40convex-dev/eslint-plugin
[oxlint]: https://oxc.rs/docs/guide/usage/linter
