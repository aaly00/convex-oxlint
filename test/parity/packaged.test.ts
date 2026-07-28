/**
 * Installs the real npm tarball into a throwaway project and drives oxlint the
 * way a user would: a bare `jsPlugins` specifier and the shipped JSON preset
 * via `extends`. Catches packaging mistakes (missing files, broken exports,
 * unresolvable specifiers) that testing against `dist/` directly cannot.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT } from "./harness.mjs";
import {
  binPath,
  parseNpmJson,
  runNode,
  runNodeStrict,
  runNpm,
} from "../../scripts/exec.mjs";

let projectDir: string;
let tarball: string;
let tarballFiles: string[];

const CONVEX_SRC = `declare function query(...a: unknown[]): unknown;
declare const ctx: any;

export const oldSyntax = query(async (c) => 1);
export const missingArgs = query({ handler: async (c) => 1 });
export const filtered = ctx.db.query("messages").filter((q) => q.eq(1, 1));
export const suppressed = ctx.db.query("m").filter((q) => q); // eslint-disable-line @convex-dev/no-filter-in-query
`;

const OUTSIDE_SRC = `declare function query(...a: unknown[]): unknown;
export const outside = query(async (c) => 1);
`;

function runOxlint(args: string[], cwd: string) {
  return runNode(binPath("oxlint", cwd), args, { cwd });
}

function diagnostics(stdout: string) {
  return JSON.parse(stdout).diagnostics.map((d: any) => ({
    file: d.filename,
    code: d.code,
    severity: d.severity,
    line: d.labels?.[0]?.span?.line ?? null,
  }));
}

beforeAll(() => {
  // Build and pack exactly what `npm publish` would upload.
  runNpm(["run", "build"], { cwd: ROOT, stdio: "pipe" });
  // `--ignore-scripts` keeps the `prepare` build's output off stdout so the
  // `--json` payload can be parsed; the build already ran above.
  const packOut = runNpm(
    ["pack", "--json", "--ignore-scripts", "--pack-destination", os.tmpdir()],
    { cwd: ROOT },
  );
  const packed = parseNpmJson(packOut)[0];
  tarball = path.join(os.tmpdir(), packed.filename);
  tarballFiles = packed.files.map((f: { path: string }) => f.path);

  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "oxpkg-"));
  fs.mkdirSync(path.join(projectDir, "convex"), { recursive: true });
  fs.mkdirSync(path.join(projectDir, "src"), { recursive: true });
  fs.writeFileSync(path.join(projectDir, "convex/messages.ts"), CONVEX_SRC);
  fs.writeFileSync(path.join(projectDir, "src/app.ts"), OUTSIDE_SRC);
  fs.writeFileSync(
    path.join(projectDir, "package.json"),
    JSON.stringify({ name: "consumer", private: true, version: "0.0.0" }),
  );
  runNpm(["install", "--no-audit", "--no-fund", tarball, "oxlint@1.76.0"], {
    cwd: projectDir,
    stdio: "pipe",
  });
}, 600_000);

describe("installed package", () => {
  it("resolves as a bare jsPlugins specifier", () => {
    fs.writeFileSync(
      path.join(projectDir, ".oxlintrc.json"),
      JSON.stringify({
        categories: {},
        plugins: [],
        jsPlugins: ["convex-oxlint"],
        rules: {
          "@convex-dev/no-old-registered-function-syntax": "error",
          "@convex-dev/require-args-validator": "error",
          "@convex-dev/no-filter-in-query": "warn",
        },
      }),
    );
    const out = diagnostics(
      runOxlint(["--format", "json", "-A", "all", "convex", "src"], projectDir),
    );
    const codes = out.map((d: any) => d.code).sort();
    expect(codes).toContain("@convex-dev(no-old-registered-function-syntax)");
    expect(codes).toContain("@convex-dev(require-args-validator)");
    expect(codes).toContain("@convex-dev(no-filter-in-query)");
    // The `eslint-disable-line` comment on the last line is honoured.
    expect(out.filter((d: any) => d.line === 7)).toEqual([]);
  }, 300_000);

  it("works through the shipped recommended preset via `extends`", () => {
    fs.writeFileSync(
      path.join(projectDir, ".oxlintrc.json"),
      JSON.stringify({
        extends: ["./node_modules/convex-oxlint/oxlintrc.recommended.json"],
        categories: {},
        plugins: [],
      }),
    );
    const out = diagnostics(
      runOxlint(["--format", "json", "-A", "all", "convex", "src"], projectDir),
    );
    expect(out.length).toBeGreaterThan(0);
    // The preset is scoped to **/convex/**/*.ts, so src/ stays clean.
    expect(out.every((d: any) => d.file.replace(/\\/g, "/").includes("convex/"))).toBe(true);
    // no-filter-in-query is a warning in the recommended config.
    const filterDiag = out.find(
      (d: any) => d.code === "@convex-dev(no-filter-in-query)",
    );
    expect(filterDiag?.severity).toBe("warning");
  }, 300_000);

  it("exposes config objects for oxlint.config.ts users", () => {
    const script = `
      import { recommended, recommendedOxlintOnly } from "convex-oxlint/configs";
      import plugin from "convex-oxlint";
      console.log(JSON.stringify({
        recommendedRules: Object.keys(recommended.overrides[0].rules),
        oxlintOnlyRules: Object.keys(recommendedOxlintOnly.overrides[0].rules),
        jsPlugins: recommended.jsPlugins,
        pluginName: plugin.meta.name,
        ruleNames: Object.keys(plugin.rules),
      }));
    `;
    fs.writeFileSync(path.join(projectDir, "probe.mjs"), script);
    const out = JSON.parse(
      runNodeStrict("probe.mjs", [], { cwd: projectDir }),
    );
    expect(out.pluginName).toBe("@convex-dev");
    expect(out.jsPlugins).toEqual(["convex-oxlint"]);
    expect(out.ruleNames).toHaveLength(6);
    expect(out.recommendedRules).toHaveLength(5);
    expect(out.oxlintOnlyRules).toHaveLength(4);
  }, 300_000);

  it("is requireable from CommonJS", () => {
    fs.writeFileSync(
      path.join(projectDir, "probe.cjs"),
      `const plugin = require("convex-oxlint");
       const p = plugin.default ?? plugin;
       console.log(JSON.stringify({ name: p.meta.name, rules: Object.keys(p.rules).length }));`,
    );
    const out = JSON.parse(
      runNodeStrict("probe.cjs", [], { cwd: projectDir }),
    );
    expect(out).toEqual({ name: "@convex-dev", rules: 6 });
  }, 300_000);

  it("ships only the intended files", () => {
    // Taken from `npm pack --json`, which reports package-relative paths, so
    // this needs no `tar` binary and behaves the same on every platform.
    const listing = tarballFiles;

    expect(listing).toContain("package.json");
    expect(listing).toContain("README.md");
    expect(listing).toContain("LICENSE");
    expect(listing).toContain("PARITY.md");
    expect(listing).toContain("dist/esm/index.js");
    expect(listing).toContain("dist/commonjs/index.js");
    expect(listing).toContain("dist/esm/index.d.ts");
    expect(listing).toContain("oxlintrc.recommended.json");
    expect(listing).toContain("oxlintrc.recommended-oxlint-only.json");
    // No test material, fixtures or build scratch in the tarball.
    expect(listing.filter((f) => f.startsWith("test/"))).toEqual([]);
    expect(listing.filter((f) => f.startsWith(".build"))).toEqual([]);
    expect(listing.filter((f) => f.endsWith(".test.ts"))).toEqual([]);
  }, 300_000);

  /**
   * Runs oxlint and returns only what it wrote to stderr.
   *
   * `spawnSync` rather than a shell redirect so this works on Windows too, and
   * because it hands back both streams regardless of exit code — oxlint exits
   * non-zero whenever it reports an error, which is not a failure here.
   */
  function stderrOf(env: NodeJS.ProcessEnv = {}) {
    const result = spawnSync(
      process.execPath,
      [binPath("oxlint", projectDir), "--format", "json", "-A", "all", "convex"],
      {
        cwd: projectDir,
        encoding: "utf8",
        // Explicitly cleared so the suite-wide silence flag does not hide the
        // notice this test is asserting on.
        env: {
          ...process.env,
          CONVEX_OXLINT_SILENCE_TYPE_AWARE_NOTICE: "",
          ...env,
        },
      },
    );
    if (result.error) throw result.error;
    return result.stderr ?? "";
  }

  it("prints the type-aware notice for an enabled inert rule, and only that rule", () => {
    fs.writeFileSync(
      path.join(projectDir, ".oxlintrc.json"),
      JSON.stringify({
        categories: {},
        plugins: [],
        jsPlugins: ["convex-oxlint"],
        rules: {
          "@convex-dev/explicit-table-ids": "error",
          "@convex-dev/no-collect-in-query": "off",
        },
      }),
    );
    const stderr = stderrOf();
    expect(stderr).toContain("cannot report under oxlint");
    expect(stderr).toContain("explicit-table-ids");
    // A rule that is switched off must stay silent.
    expect(stderr).not.toContain("no-collect-in-query");
  }, 300_000);

  it("prints the notice at most once per rule", () => {
    const stderr = stderrOf();
    expect(stderr.split("explicit-table-ids").length - 1).toBe(1);
  }, 300_000);

  it("suppresses the notice when the env var is set", () => {
    expect(
      stderrOf({ CONVEX_OXLINT_SILENCE_TYPE_AWARE_NOTICE: "1" }),
    ).not.toContain("cannot report under oxlint");
  }, 300_000);

  it("stays silent when neither type-aware rule is enabled", () => {
    fs.writeFileSync(
      path.join(projectDir, ".oxlintrc.json"),
      JSON.stringify({
        categories: {},
        plugins: [],
        jsPlugins: ["convex-oxlint"],
        rules: { "@convex-dev/no-filter-in-query": "error" },
      }),
    );
    expect(stderrOf()).not.toContain("cannot report under oxlint");
  }, 300_000);
});
