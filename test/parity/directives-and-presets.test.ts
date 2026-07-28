import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ESLint } from "eslint";
import tsParser from "@typescript-eslint/parser";
import convexEslintPlugin from "@convex-dev/eslint-plugin";
import {
  ROOT,
  collectFixtures,
  comparable,
  loadPlugin,
  normalizeEslint,
  normalizeOxlint,
  runEslint,
  runOxlint,
  rulesForProfile,
} from "./harness.mjs";

const HANDWRITTEN = collectFixtures(
  path.join(ROOT, "test/fixtures/handwritten"),
);

describe("eslint-disable directive parity", () => {
  it("oxlint honours the same directives as ESLint", async () => {
    const rules = rulesForProfile("error");
    const eslintRaw = await runEslint({
      plugin: "official",
      rules,
      files: HANDWRITTEN,
    });
    const oxlintRaw = runOxlint({ rules, files: HANDWRITTEN });
    expect(eslintRaw.filter((d: any) => d.fatal)).toEqual([]);
    expect(oxlintRaw.filter((d: any) => !d.ruleId)).toEqual([]);
    const eslint = comparable(normalizeEslint(eslintRaw));
    const oxlint = comparable(normalizeOxlint(oxlintRaw));
    expect(oxlint).toEqual(eslint);
  }, 240_000);

  it("directives actually suppressed something (not a vacuous pass)", async () => {
    const rules = rulesForProfile("error");
    const file = path.join(
      ROOT,
      "test/fixtures/handwritten/convex/disable_directives.ts",
    );
    const withDirectives = comparable(
      normalizeOxlint(runOxlint({ rules, files: [file] })),
    );

    // Same source with every disable comment stripped.
    const stripped = fs
      .readFileSync(file, "utf8")
      .split("\n")
      .map((line) =>
        line.replace(/\/\/ eslint-disable.*$/, "").replace(/\/\*\s*eslint-(disable|enable).*?\*\//g, ""),
      )
      .join("\n");
    const tmp = path.join(
      ROOT,
      "test/fixtures/handwritten/convex/.directives_stripped.tmp.ts",
    );
    fs.writeFileSync(tmp, stripped);
    try {
      const withoutDirectives = comparable(
        normalizeOxlint(runOxlint({ rules, files: [tmp] })),
      );
      expect(withoutDirectives.length).toBeGreaterThan(withDirectives.length);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }, 240_000);
});

describe("shipped recommended preset parity", () => {
  it("the oxlint preset matches ESLint's recommended config", async () => {
    const preset = JSON.parse(
      fs.readFileSync(path.join(ROOT, "oxlintrc.recommended.json"), "utf8"),
    );

    // ESLint side: the official plugin's own `recommended` config, plus a
    // parser so that .ts files can be parsed at all.
    const eslint = new ESLint({
      cwd: ROOT,
      overrideConfigFile: true,
      ignore: false,
      overrideConfig: [
        { linterOptions: { reportUnusedDisableDirectives: "off" } },
        {
          files: ["**/*.ts", "**/*.tsx"],
          languageOptions: { parser: tsParser, parserOptions: {} },
        },
        ...(convexEslintPlugin as any).configs.recommended,
      ],
    });
    const results = await eslint.lintFiles(HANDWRITTEN);
    const eslintDiagnostics = comparable(
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

    // Oxlint side: the exact JSON preset this package publishes, with the
    // jsPlugins entry pointed at the local build.
    const oxlintDiagnostics = comparable(
      normalizeOxlint(
        runOxlint({
          rules: {},
          files: HANDWRITTEN,
          extraConfig: { overrides: preset.overrides },
        }).filter((d: any) => d.ruleId),
      ),
    );

    expect(oxlintDiagnostics).toEqual(eslintDiagnostics);
    // The preset only applies inside convex/, so files under src/ stay clean.
    expect(
      oxlintDiagnostics.every((d) =>
        d.file.replace(/\\/g, "/").includes("/convex/"),
      ),
    ).toBe(true);
    expect(oxlintDiagnostics.length).toBeGreaterThan(0);
  }, 240_000);

  it("recommended severities land as ESLint spells them", async () => {
    const preset = JSON.parse(
      fs.readFileSync(path.join(ROOT, "oxlintrc.recommended.json"), "utf8"),
    );
    expect(preset.overrides[0].rules).toEqual({
      "@convex-dev/import-wrong-runtime": "off",
      "@convex-dev/no-old-registered-function-syntax": "error",
      "@convex-dev/require-args-validator": "error",
      "@convex-dev/explicit-table-ids": "error",
      "@convex-dev/no-filter-in-query": "warn",
    });
    expect(preset.overrides[0].files).toEqual(["**/convex/**/*.ts"]);
  });
});

describe("this port running under ESLint matches the official plugin under ESLint", () => {
  it("is identical for every rule", async () => {
    const rules = rulesForProfile("error");
    const files = [
      ...HANDWRITTEN,
      ...collectFixtures(path.join(ROOT, "test/fixtures/generated")),
    ];
    const official = comparable(
      normalizeEslint(
        (await runEslint({ plugin: "official", rules, files })).filter(
          (d: any) => !d.fatal,
        ),
      ),
    );
    const port = comparable(
      normalizeEslint(
        (await runEslint({ plugin: "port", rules, files })).filter(
          (d: any) => !d.fatal,
        ),
      ),
    );
    expect(port).toEqual(official);
  }, 300_000);

  it("produces identical fix ranges and replacement text", async () => {
    const rules = rulesForProfile("error");
    const files = collectFixtures(path.join(ROOT, "test/fixtures/generated"));
    const shape = (list: any[]) =>
      list
        .filter((d) => !d.fatal)
        .map((d) => ({
          file: d.file,
          ruleId: d.ruleId,
          line: d.line,
          column: d.column,
          fix: d.fix,
          suggestions: d.suggestions,
        }))
        .sort((a, b) =>
          JSON.stringify(a) < JSON.stringify(b) ? -1 : 1,
        );

    const official = shape(
      await runEslint({ plugin: "official", rules, files }),
    );
    const port = shape(await runEslint({ plugin: "port", rules, files }));
    expect(port).toEqual(official);
    expect(official.some((d) => d.fix)).toBe(true);
  }, 300_000);
});

describe("plugin surface", () => {
  it("exposes exactly the official plugin's rule ids", async () => {
    const port: any = await loadPlugin("port");
    expect(Object.keys(port.rules).sort()).toEqual(
      Object.keys((convexEslintPlugin as any).rules).sort(),
    );
  });

  it("copies each rule's messages verbatim", async () => {
    const port: any = await loadPlugin("port");
    for (const [name, officialRule] of Object.entries<any>(
      (convexEslintPlugin as any).rules,
    )) {
      expect(port.rules[name].meta.messages, `messages for ${name}`).toEqual(
        officialRule.meta.messages,
      );
    }
  });

  it("copies each rule's schema, fixability and suggestion support", async () => {
    const port: any = await loadPlugin("port");
    for (const [name, officialRule] of Object.entries<any>(
      (convexEslintPlugin as any).rules,
    )) {
      const mine = port.rules[name].meta;
      const theirs = officialRule.meta;
      expect(mine.schema, `schema for ${name}`).toEqual(theirs.schema);
      expect(mine.fixable ?? null, `fixable for ${name}`).toEqual(
        theirs.fixable ?? null,
      );
      expect(mine.hasSuggestions ?? false, `hasSuggestions for ${name}`).toEqual(
        theirs.hasSuggestions ?? false,
      );
      expect(mine.type, `type for ${name}`).toEqual(theirs.type);
      expect(mine.docs?.description, `description for ${name}`).toEqual(
        theirs.docs?.description,
      );
    }
  });

  it("uses the same docs URLs", async () => {
    const port: any = await loadPlugin("port");
    for (const [name, officialRule] of Object.entries<any>(
      (convexEslintPlugin as any).rules,
    )) {
      expect(port.rules[name].meta.docs?.url, `url for ${name}`).toEqual(
        officialRule.meta.docs?.url,
      );
    }
  });
});
