// Wall-clock comparison of `eslint + @convex-dev/eslint-plugin` against
// `oxlint + convex-oxlint` on a synthetic Convex codebase.
//
// Both runs execute the real CLIs in child processes, so the numbers include
// process start-up, file discovery and parsing — what a developer actually
// waits for. Run with: npm run bench
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FILES = Number(process.env.BENCH_FILES ?? 500);
const RUNS = Number(process.env.BENCH_RUNS ?? 3);

const FILE_TEMPLATE = (i) => `import { v } from "convex/values";
declare function query(...a: unknown[]): unknown;
declare function mutation(...a: unknown[]): unknown;
declare const ctx: any;

export const list${i} = query({
  args: {},
  handler: async (c) => c.db.query("messages").collect(),
});

export const legacy${i} = query(async (c) => 1);

export const missing${i} = mutation({ handler: async (c, args) => args });

export const filtered${i} = query({
  args: {},
  handler: async (c) =>
    c.db
      .query("messages")
      .withIndex("by_author")
      .filter((q) => q.eq(q.field("author"), "me"))
      .take(10),
});

export const helper${i} = () => {
  const rows = ctx.db.query("messages").collect();
  return rows.filter((r) => r.a === 1);
};

${Array.from({ length: 12 }, (_, k) => `export const extra${i}_${k} = query({ args: {}, handler: async (c) => ${k} });`).join("\n")}
`;

function buildCorpus() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oxbench-"));
  const convex = path.join(dir, "convex");
  fs.mkdirSync(convex, { recursive: true });
  for (let i = 0; i < FILES; i++) {
    fs.writeFileSync(path.join(convex, `mod_${i}.ts`), FILE_TEMPLATE(i));
  }
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "bench", private: true, version: "0.0.0", type: "module" }),
  );

  // ESLint flat config using the official plugin.
  fs.writeFileSync(
    path.join(dir, "eslint.config.mjs"),
    `import tsParser from ${JSON.stringify(path.join(ROOT, "node_modules/@typescript-eslint/parser/dist/index.js"))};
import convex from ${JSON.stringify(path.join(ROOT, "node_modules/@convex-dev/eslint-plugin/dist/esm/index.js"))};
export default [
  { linterOptions: { reportUnusedDisableDirectives: "off" } },
  {
    files: ["**/*.ts"],
    languageOptions: { parser: tsParser, parserOptions: {} },
    plugins: { "@convex-dev": convex },
    rules: {
      "@convex-dev/no-old-registered-function-syntax": "error",
      "@convex-dev/require-args-validator": "error",
      "@convex-dev/no-filter-in-query": "warn",
      "@convex-dev/import-wrong-runtime": "off",
    },
  },
];
`,
  );

  // Oxlint config using this port.
  fs.writeFileSync(
    path.join(dir, ".oxlintrc.json"),
    JSON.stringify({
      categories: {},
      plugins: [],
      jsPlugins: [path.join(ROOT, "dist/esm/index.js")],
      rules: {
        "@convex-dev/no-old-registered-function-syntax": "error",
        "@convex-dev/require-args-validator": "error",
        "@convex-dev/no-filter-in-query": "warn",
        "@convex-dev/import-wrong-runtime": "off",
      },
    }),
  );
  return dir;
}

function time(fn) {
  const start = process.hrtime.bigint();
  const result = fn();
  return { ms: Number(process.hrtime.bigint() - start) / 1e6, result };
}

function runEslint(dir) {
  try {
    return execFileSync(
      path.join(ROOT, "node_modules/.bin/eslint"),
      ["--no-warn-ignored", "-f", "json", "convex"],
      { cwd: dir, encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (err) {
    if (err.stdout == null) throw err;
    return err.stdout;
  }
}

function runOxlint(dir) {
  try {
    return execFileSync(
      path.join(ROOT, "node_modules/.bin/oxlint"),
      ["--format", "json", "--no-ignore", "-A", "all", "convex"],
      {
        cwd: dir,
        encoding: "utf8",
        maxBuffer: 512 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, CONVEX_OXLINT_SILENCE_TYPE_AWARE_NOTICE: "1" },
      },
    );
  } catch (err) {
    if (err.stdout == null) throw err;
    return err.stdout;
  }
}

const dir = buildCorpus();
console.log(`corpus: ${FILES} files under ${dir}\n`);

// Warm-up so neither side pays first-run filesystem cost.
runEslint(dir);
runOxlint(dir);

const eslintTimes = [];
const oxlintTimes = [];
let eslintCount = 0;
let oxlintCount = 0;

for (let i = 0; i < RUNS; i++) {
  const e = time(() => runEslint(dir));
  eslintTimes.push(e.ms);
  eslintCount = JSON.parse(e.result).reduce(
    (n, r) => n + r.messages.length,
    0,
  );

  const o = time(() => runOxlint(dir));
  oxlintTimes.push(o.ms);
  oxlintCount = JSON.parse(o.result).diagnostics.length;
}

const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const eMs = median(eslintTimes);
const oMs = median(oxlintTimes);

console.log(`eslint  + @convex-dev/eslint-plugin : ${eMs.toFixed(0)} ms  (${eslintCount} diagnostics)`);
console.log(`oxlint  + convex-oxlint             : ${oMs.toFixed(0)} ms  (${oxlintCount} diagnostics)`);
console.log(`\nspeedup: ${(eMs / oMs).toFixed(2)}x`);

if (eslintCount !== oxlintCount) {
  console.error(
    `\nWARNING: diagnostic counts differ (${eslintCount} vs ${oxlintCount}); the benchmark is not comparing equal work.`,
  );
  process.exitCode = 1;
}

fs.rmSync(dir, { recursive: true, force: true });
