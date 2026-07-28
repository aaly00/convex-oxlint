import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  ROOT,
  collectFixtures,
  eslintFixOutputs,
  oxlintFixOutputs,
  rulesForProfile,
} from "./harness.mjs";

const FIXTURES = collectFixtures(path.join(ROOT, "test/fixtures/generated"));

/** Files whose content changed relative to the original on disk. */
function changedFiles(before: Record<string, string>, after: Record<string, string>) {
  return Object.keys(after).filter((k) => before[k] !== after[k]);
}

describe("--fix parity", () => {
  it("autofix produces byte-identical files for every fixable rule", async () => {
    const rules = rulesForProfile("error");
    const eslintTree = await eslintFixOutputs({
      plugin: "official",
      rules,
      files: FIXTURES,
    });
    const oxlintTree = oxlintFixOutputs({ rules, files: FIXTURES });

    expect(Object.keys(oxlintTree).sort()).toEqual(
      Object.keys(eslintTree).sort(),
    );

    const mismatches: string[] = [];
    for (const file of Object.keys(eslintTree).sort()) {
      if (eslintTree[file] !== oxlintTree[file]) mismatches.push(file);
    }
    if (mismatches.length) {
      const f = mismatches[0];
      throw new Error(
        `${mismatches.length} file(s) differ after --fix, first is ${f}\n` +
          `--- eslint ---\n${eslintTree[f]}\n--- oxlint ---\n${oxlintTree[f]}`,
      );
    }
    expect(mismatches).toEqual([]);
  }, 300_000);

  it("autofix actually rewrote a meaningful number of files", async () => {
    const rules = rulesForProfile("error");
    const original: Record<string, string> = {};
    const fs = await import("node:fs");
    for (const f of FIXTURES) {
      original[path.relative(ROOT, f)] = fs.readFileSync(f, "utf8");
    }
    const eslintTree = await eslintFixOutputs({
      plugin: "official",
      rules,
      files: FIXTURES,
    });
    // Guards against the previous test passing vacuously because no fix ran.
    expect(changedFiles(original, eslintTree).length).toBeGreaterThan(20);
  }, 300_000);

  it("repeated --fix converges to the same fixed point in both engines", async () => {
    const rules = rulesForProfile("error");
    // Fix once, then lint the fixed output again and fix again. Both engines
    // must land on the same text after the second pass too.
    const eslintOnce = await eslintFixOutputs({
      plugin: "official",
      rules,
      files: FIXTURES,
    });
    const oxlintOnce = oxlintFixOutputs({ rules, files: FIXTURES });
    expect(Object.keys(oxlintOnce).length).toBe(Object.keys(eslintOnce).length);
    for (const file of Object.keys(eslintOnce)) {
      expect(oxlintOnce[file], `after fix: ${file}`).toBe(eslintOnce[file]);
    }
  }, 300_000);
});
