/**
 * Machine-verifies the oxlint capability claims this package's parity story
 * rests on, so they are re-checked on every oxlint upgrade rather than trusted
 * from documentation.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT } from "./harness.mjs";
import { binPath, runNode } from "../../scripts/exec.mjs";

const OXLINT_BIN = binPath("oxlint", ROOT);

const PROBE_PLUGIN = `
const rule = {
  meta: { messages: { m: "{{payload}}" } },
  create(context) {
    return {
      Program(node) {
        context.report({
          node,
          messageId: "m",
          data: {
            payload: JSON.stringify({
              parserServiceKeys: Object.keys(context.sourceCode.parserServices || {}),
              isESTree: context.sourceCode.isESTree,
              hasScopeManager: !!context.sourceCode.scopeManager,
              filenameIsAbsolute: context.filename.startsWith("/") || /^[A-Za-z]:/.test(context.filename),
              id: context.id,
            }),
          },
        });
      },
    };
  },
};
export default { meta: { name: "@convex-dev" }, rules: { probe: rule } };
`;

function runProbe(extraArgs: string[] = [], typeAware = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oxcap-"));
  fs.mkdirSync(path.join(dir, "convex"), { recursive: true });
  fs.writeFileSync(path.join(dir, "plugin.mjs"), PROBE_PLUGIN);
  fs.writeFileSync(
    path.join(dir, "convex/a.ts"),
    "export const a: number = 1;\n",
  );
  fs.writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "Bundler",
        strict: true,
        skipLibCheck: true,
      },
      include: ["convex"],
    }),
  );
  fs.writeFileSync(
    path.join(dir, ".oxlintrc.json"),
    JSON.stringify({
      categories: {},
      plugins: [],
      jsPlugins: ["./plugin.mjs"],
      rules: { "@convex-dev/probe": "error" },
      ...(typeAware ? { options: { typeAware: true } } : {}),
    }),
  );
  let stdout = "";
  try {
    stdout = runNode(
      OXLINT_BIN,
      ["--format", "json", "--no-ignore", "-A", "all", ...extraArgs, "convex"],
      { cwd: dir },
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const parsed = JSON.parse(stdout);
  const probe = parsed.diagnostics.find((d: any) =>
    d.code?.includes("probe"),
  );
  expect(probe, `probe rule produced no diagnostic; got ${stdout}`).toBeTruthy();
  return JSON.parse(probe.message);
}

describe("oxlint JS plugin capabilities", () => {
  it("provides no parser services", () => {
    expect(runProbe().parserServiceKeys).toEqual([]);
  });

  it("still provides no parser services under --type-aware", () => {
    // This is the claim that makes explicit-table-ids and no-collect-in-query
    // unimplementable. If it ever flips, this test fails and those two rules
    // must be written for real.
    expect(runProbe(["--type-aware"], true).parserServiceKeys).toEqual([]);
  });

  it("exposes an ESTree AST and a scope manager", () => {
    const probe = runProbe();
    expect(probe.isESTree).toBe(true);
    expect(probe.hasScopeManager).toBe(true);
  });

  it("gives rules an absolute filename, as ESLint does", () => {
    expect(runProbe().filenameIsAbsolute).toBe(true);
  });

  it("derives rule ids from meta.name, so ids match ESLint's", () => {
    expect(runProbe().id).toBe("@convex-dev/probe");
  });
});
