/**
 * Pins the exact, complete set of behaviors that oxlint cannot reproduce.
 *
 * Oxlint gives JS plugins no parser services (verified in
 * `capabilities.test.ts`), so any ESLint rule logic that consults the
 * TypeScript type checker is unreachable. This suite measures precisely what
 * that costs on a realistic, fully typed Convex project:
 *
 *   1. oxlint === ESLint *without* type-aware linting — the parity contract.
 *   2. ESLint *with* type-aware linting reports strictly more, and this test
 *      records exactly which extra diagnostics those are.
 *
 * If Convex changes a rule, or oxlint gains parser services, these numbers
 * move and the test fails loudly instead of the gap going unnoticed.
 */
import { describe, expect, it } from "vitest";
import path from "node:path";
import { ESLint } from "eslint";
import tsParser from "@typescript-eslint/parser";
import convexEslintPlugin from "@convex-dev/eslint-plugin";
import {
  ROOT,
  collectFixtures,
  comparable,
  normalizeEslint,
  normalizeOxlint,
  runOxlint,
  rulesForProfile,
} from "./harness.mjs";

const TYPED_DIR = path.join(ROOT, "test/fixtures/typed");
const TYPED_FILES = collectFixtures(TYPED_DIR).filter(
  (f) => !f.endsWith(".d.ts"),
);
const RULES = rulesForProfile("error");

async function eslintOnTypedProject(typeAware: boolean) {
  const eslint = new ESLint({
    cwd: TYPED_DIR,
    overrideConfigFile: true,
    ignore: false,
    overrideConfig: [
      { linterOptions: { reportUnusedDisableDirectives: "off" } },
      {
        files: ["**/*.ts", "**/*.tsx"],
        languageOptions: {
          parser: tsParser,
          parserOptions: typeAware
            ? { projectService: true, tsconfigRootDir: TYPED_DIR }
            : {},
        },
        plugins: { "@convex-dev": convexEslintPlugin },
        rules: RULES,
      },
    ],
  });
  const results = await eslint.lintFiles(TYPED_FILES);
  const fatal = results.flatMap((r) =>
    r.messages.filter((m) => m.fatal).map((m) => `${r.filePath}: ${m.message}`),
  );
  expect(fatal, "typed fixture must parse").toEqual([]);
  return comparable(
    normalizeEslint(
      results.flatMap((r) =>
        r.messages
          .filter((m) => !m.fatal)
          .map((m) => ({
            file: path.relative(ROOT, r.filePath),
            ruleId: m.ruleId,
            severity: m.severity === 1 ? "warning" : "error",
            message: m.message,
            line: m.line,
            column: m.column,
            endLine: m.endLine ?? null,
            endColumn: m.endColumn ?? null,
          })),
      ),
    ),
  );
}

function key(d: { file: string; ruleId: string | null; line: number | null; column: number | null }) {
  return `${d.file}|${d.ruleId}|${d.line}:${d.column}`;
}

describe("type-aware deviations, measured on a fully typed Convex project", () => {
  it("oxlint exactly matches ESLint without type-aware linting", async () => {
    const eslint = await eslintOnTypedProject(false);
    const oxlint = comparable(
      normalizeOxlint(
        runOxlint({ rules: RULES, files: TYPED_FILES }).filter(
          (d: any) => d.ruleId,
        ),
      ),
    );
    expect(oxlint).toEqual(eslint);
    expect(oxlint.length).toBeGreaterThan(0);
  }, 300_000);

  it("type-aware ESLint is a strict superset, and the gap is only the known rules", async () => {
    const withoutTypes = await eslintOnTypedProject(false);
    const withTypes = await eslintOnTypedProject(true);

    const withoutKeys = new Set(withoutTypes.map(key));
    const extra = withTypes.filter((d) => !withoutKeys.has(key(d)));
    const withTypesKeys = new Set(withTypes.map(key));
    const lost = withoutTypes.filter((d) => !withTypesKeys.has(key(d)));

    // Turning type information on never removes a diagnostic.
    expect(lost, "type-aware linting must not lose diagnostics").toEqual([]);
    expect(extra.length).toBeGreaterThan(0);

    // Every diagnostic oxlint cannot produce comes from one of exactly three
    // rules. `explicit-table-ids` and `no-collect-in-query` are entirely
    // type-dependent; `no-filter-in-query` has an AST fallback that oxlint
    // uses, which catches less than the type-aware path.
    expect(new Set(extra.map((d) => d.ruleId))).toEqual(
      new Set([
        "@convex-dev/explicit-table-ids",
        "@convex-dev/no-collect-in-query",
        "@convex-dev/no-filter-in-query",
      ]),
    );
  }, 300_000);

  it("records the exact no-filter-in-query cases only type information can catch", async () => {
    const rules = { "@convex-dev/no-filter-in-query": "error" };
    const only = (list: any[]) =>
      list
        .filter((d) => d.file.endsWith("convex/filters.ts"))
        .map((d) => `${d.line}:${d.column}`)
        .sort();

    const eslint = new ESLint({
      cwd: TYPED_DIR,
      overrideConfigFile: true,
      ignore: false,
      overrideConfig: [
        { linterOptions: { reportUnusedDisableDirectives: "off" } },
        {
          files: ["**/*.ts"],
          languageOptions: {
            parser: tsParser,
            parserOptions: { projectService: true, tsconfigRootDir: TYPED_DIR },
          },
          plugins: { "@convex-dev": convexEslintPlugin },
          rules,
        },
      ],
    });
    const typed = comparable(
      normalizeEslint(
        (await eslint.lintFiles(TYPED_FILES)).flatMap((r) =>
          r.messages
            .filter((m) => !m.fatal)
            .map((m) => ({
              file: path.relative(ROOT, r.filePath),
              ruleId: m.ruleId,
              severity: "error",
              message: m.message,
              line: m.line,
              column: m.column,
              endLine: m.endLine ?? null,
              endColumn: m.endColumn ?? null,
            })),
        ),
      ),
    );
    const ox = comparable(
      normalizeOxlint(
        runOxlint({ rules, files: TYPED_FILES }).filter((d: any) => d.ruleId),
      ),
    );

    // `direct` and `chained` — receivers that are literal `ctx.db.query(...)`
    // chains — are caught by both.
    expect(only(ox)).toEqual(["19:8", "8:43"]);
    // Type-aware ESLint additionally catches the query-in-a-variable, the
    // renamed DatabaseReader and the helper-function forms.
    expect(only(typed)).toEqual(["19:8", "30:20", "39:43", "47:26", "8:43"]);
  }, 300_000);
});
