import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  ALL_RULES,
  ROOT,
  collectFixtures,
  comparable,
  normalizeEslint,
  normalizeOxlint,
  runEslint,
  runOxlint,
  rulesForProfile,
} from "./harness.mjs";

const FIXTURES = collectFixtures(path.join(ROOT, "test/fixtures/generated"));

/** Splits parse failures out so they are asserted on explicitly. */
function partition(eslintRaw: any[], oxlintRaw: any[]) {
  return {
    eslintFatal: eslintRaw.filter((d) => d.fatal),
    eslintRules: eslintRaw.filter((d) => !d.fatal),
    oxlintNonRule: oxlintRaw.filter((d) => !d.ruleId),
    oxlintRules: oxlintRaw.filter((d) => d.ruleId),
  };
}

async function compare(rules: Record<string, unknown>, files = FIXTURES) {
  const eslintRaw = await runEslint({ plugin: "official", rules, files });
  const oxlintRaw = runOxlint({ rules, files });
  const p = partition(eslintRaw, oxlintRaw);
  return {
    ...p,
    eslint: comparable(normalizeEslint(p.eslintRules)),
    oxlint: comparable(normalizeOxlint(p.oxlintRules)),
  };
}

describe("corpus", () => {
  it("has a non-trivial number of fixtures", () => {
    expect(FIXTURES.length).toBeGreaterThan(75);
  });
});

describe("diagnostic parity: every rule at error severity", () => {
  it("produces byte-identical diagnostics", async () => {
    const { eslint, oxlint, eslintFatal, oxlintNonRule } = await compare(
      rulesForProfile("error"),
    );
    expect(eslintFatal, "ESLint parse failures").toEqual([]);
    expect(
      oxlintNonRule.map((d: any) => `${d.file}: ${d.message}`),
      "oxlint parse failures",
    ).toEqual([]);
    expect(oxlint.length).toBeGreaterThan(1000);
    expect(oxlint).toEqual(eslint);
  }, 240_000);
});

describe("diagnostic parity: every rule at warn severity", () => {
  it("maps severities identically", async () => {
    const { eslint, oxlint } = await compare(rulesForProfile("warn"));
    expect(oxlint).toEqual(eslint);
    expect(new Set(oxlint.map((d) => d.severity))).toEqual(
      new Set(["warning"]),
    );
  }, 240_000);
});

describe("diagnostic parity: mixed severities matching the recommended config", () => {
  it("produces identical diagnostics", async () => {
    const rules = {
      "@convex-dev/import-wrong-runtime": "off",
      "@convex-dev/no-old-registered-function-syntax": "error",
      "@convex-dev/require-args-validator": "error",
      "@convex-dev/explicit-table-ids": "error",
      "@convex-dev/no-filter-in-query": "warn",
      "@convex-dev/no-collect-in-query": "off",
    };
    const { eslint, oxlint } = await compare(rules);
    expect(oxlint).toEqual(eslint);
  }, 240_000);
});

describe("diagnostic parity: require-args-validator options", () => {
  for (const ignoreUnusedArguments of [true, false]) {
    it(`ignoreUnusedArguments: ${ignoreUnusedArguments}`, async () => {
      const rules = {
        "@convex-dev/require-args-validator": [
          "error",
          { ignoreUnusedArguments },
        ],
      };
      const { eslint, oxlint } = await compare(rules);
      expect(oxlint).toEqual(eslint);
    }, 240_000);
  }

  it("with options omitted entirely", async () => {
    const rules = { "@convex-dev/require-args-validator": "error" };
    const { eslint, oxlint } = await compare(rules);
    expect(oxlint).toEqual(eslint);
  }, 240_000);

  it("with an empty options object", async () => {
    const rules = { "@convex-dev/require-args-validator": ["error", {}] };
    const { eslint, oxlint } = await compare(rules);
    expect(oxlint).toEqual(eslint);
  }, 240_000);

  it("the two option values actually differ, so the test is meaningful", async () => {
    const on = await compare({
      "@convex-dev/require-args-validator": [
        "error",
        { ignoreUnusedArguments: true },
      ],
    });
    const off = await compare({
      "@convex-dev/require-args-validator": [
        "error",
        { ignoreUnusedArguments: false },
      ],
    });
    expect(on.oxlint.length).toBeLessThan(off.oxlint.length);
  }, 240_000);
});

describe("diagnostic parity: one rule at a time", () => {
  for (const rule of ALL_RULES) {
    it(`@convex-dev/${rule} in isolation`, async () => {
      const { eslint, oxlint } = await compare({
        [`@convex-dev/${rule}`]: "error",
      });
      expect(oxlint).toEqual(eslint);
    }, 240_000);
  }
});

describe("type-aware rules are inert in both engines without type information", () => {
  it("explicit-table-ids and no-collect-in-query report nothing", async () => {
    const { eslint, oxlint } = await compare({
      "@convex-dev/explicit-table-ids": "error",
      "@convex-dev/no-collect-in-query": "error",
    });
    expect(eslint).toEqual([]);
    expect(oxlint).toEqual([]);
  }, 240_000);
});
