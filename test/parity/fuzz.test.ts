import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  comparable,
  normalizeEslint,
  normalizeOxlint,
  runEslint,
  runOxlint,
  rulesForProfile,
  ROOT,
} from "./harness.mjs";

/** Deterministic PRNG (mulberry32) so a failing run is reproducible by seed. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REGISTRARS = [
  "query",
  "mutation",
  "action",
  "internalQuery",
  "internalMutation",
  "internalAction",
  "notARegistrar",
  "queryX",
];

const RECEIVER_ROOTS = [
  "ctx.db",
  "db",
  "this.db",
  "a.b.db",
  "ctx.notDb",
  "other",
  "db.privateSystem",
  "ctx.db.privateSystem",
  "notdb",
];

const CHAIN_METHODS = [
  ".withIndex('i')",
  ".order('desc')",
  ".withSearchIndex('s', (q) => q)",
  ".filter((q) => q)",
  ".unknownMethod()",
  ".collect()",
  ".take(1)",
  ".first()",
  ".unique()",
  ".paginate(o)",
];

const WRAPPERS = [
  (s: string) => s,
  (s: string) => `(${s})`,
  (s: string) => `await ${s}`,
  (s: string) => `${s}!`,
  (s: string) => `(${s} as any)`,
  (s: string) => `<any>${s}`,
];

const PARAMS = [
  "(ctx)",
  "(ctx, args)",
  "(ctx, {})",
  "(ctx, { a })",
  "(ctx, ...rest)",
  "()",
  "(ctx, args, third)",
];

const OBJ_KEYS = [
  "args: {}",
  "handler: async (ctx) => 1",
  "handler: async (ctx, args) => args",
  "handler: async (ctx, {}) => 1",
  "handler: notAFunction",
  "handler(ctx, args) { return args; }",
  "returns: v.null()",
  "...spread",
  "['args']: {}",
  "'args': {}",
  "args",
];

function pick<T>(r: () => number, arr: T[]): T {
  return arr[Math.floor(r() * arr.length)];
}

function randomChain(r: () => number): string {
  const root = pick(r, RECEIVER_ROOTS);
  let expr = `${root}.query('m')`;
  const links = Math.floor(r() * 4);
  for (let i = 0; i < links; i++) expr += pick(r, CHAIN_METHODS);
  expr = pick(r, WRAPPERS)(expr);
  return `(${expr}).filter((q) => q)`;
}

function randomRegistrarCall(r: () => number): string {
  const reg = pick(r, REGISTRARS);
  if (r() < 0.5) {
    const asyncKw = r() < 0.5 ? "async " : "";
    const params = pick(r, PARAMS);
    const fn =
      r() < 0.5
        ? `${asyncKw}${params} => 1`
        : `${asyncKw}function ${params} { return 1; }`;
    return `${reg}(${fn})`;
  }
  const count = Math.floor(r() * 4);
  const keys: string[] = [];
  for (let i = 0; i < count; i++) keys.push(pick(r, OBJ_KEYS));
  return `${reg}({ ${keys.join(", ")} })`;
}

function randomProgram(r: () => number, statements: number): string {
  const lines = [
    "declare const ctx: any;",
    "declare const db: any;",
    "declare const a: any;",
    "declare const other: any;",
    "declare const notdb: any;",
    "declare const o: any;",
    "declare const v: any;",
    "declare const spread: any;",
    "declare const args: any;",
    "declare const notAFunction: any;",
    "declare function query(...x: unknown[]): any;",
    "declare function mutation(...x: unknown[]): any;",
    "declare function action(...x: unknown[]): any;",
    "declare function internalQuery(...x: unknown[]): any;",
    "declare function internalMutation(...x: unknown[]): any;",
    "declare function internalAction(...x: unknown[]): any;",
    "declare function notARegistrar(...x: unknown[]): any;",
    "declare function queryX(...x: unknown[]): any;",
    "export class C { db: any; m() { return this.db.query('m'); } }",
  ];
  for (let i = 0; i < statements; i++) {
    const kind = r();
    const exported = r() < 0.75 ? "export " : "";
    const binder = pick(r, ["const", "let", "var"]);
    if (kind < 0.5) {
      lines.push(`${exported}${binder} v${i} = ${randomRegistrarCall(r)};`);
    } else if (kind < 0.85) {
      lines.push(`${exported}${binder} v${i} = ${randomChain(r)};`);
    } else {
      // Nested inside a function body, where the `parent` chain differs.
      // The IIFE is async because generated chains may contain `await`.
      lines.push(
        `${exported}${binder} v${i} = (async () => { const inner = ${randomRegistrarCall(r)}; return ${randomChain(r)}; })();`,
      );
    }
  }
  return lines.join("\n") + "\n";
}

async function assertParity(files: string[], label: string) {
  const rules = rulesForProfile("error");
  const eslintRaw = await runEslint({ plugin: "official", rules, files });
  const fatal = eslintRaw.filter((d: any) => d.fatal);
  expect(
    fatal.map((f: any) => `${f.file}: ${f.message}`),
    `${label} parses under ESLint`,
  ).toEqual([]);
  const oxlintRaw = runOxlint({ rules, files });
  const parseErrors = oxlintRaw.filter((d: any) => !d.ruleId);
  expect(
    parseErrors.map((f: any) => `${f.file}: ${f.message}`),
    `${label} parses under oxlint`,
  ).toEqual([]);
  const eslint = comparable(normalizeEslint(eslintRaw));
  const oxlint = comparable(normalizeOxlint(oxlintRaw));
  expect(oxlint, label).toEqual(eslint);
  return oxlint.length;
}

describe("randomized differential testing", () => {
  it("matches ESLint across 400 generated programs", async () => {
    // Written under ROOT so both engines resolve the same absolute paths and
    // the `convex/` path segment the rules key on is present.
    const corpus = path.join(ROOT, ".fuzz-corpus", "convex");
    fs.rmSync(path.join(ROOT, ".fuzz-corpus"), {
      recursive: true,
      force: true,
    });
    fs.mkdirSync(corpus, { recursive: true });
    const files: string[] = [];
    for (let seed = 1; seed <= 400; seed++) {
      const r = rng(seed * 2654435761);
      const file = path.join(corpus, `fuzz_${seed}.ts`);
      fs.writeFileSync(file, randomProgram(r, 12));
      files.push(file);
    }
    try {
      const count = await assertParity(files, "fuzz corpus");
      // Guards against a vacuous pass where nothing was reported at all.
      expect(count).toBeGreaterThan(500);
    } finally {
      fs.rmSync(path.join(ROOT, ".fuzz-corpus"), {
        recursive: true,
        force: true,
      });
    }
  }, 600_000);

  it("matches ESLint on deeply nested and chained programs", async () => {
    const corpus = path.join(ROOT, ".fuzz-corpus-deep", "convex");
    fs.rmSync(path.join(ROOT, ".fuzz-corpus-deep"), {
      recursive: true,
      force: true,
    });
    fs.mkdirSync(corpus, { recursive: true });
    const files: string[] = [];
    for (let seed = 1; seed <= 60; seed++) {
      const r = rng(seed * 40503);
      const file = path.join(corpus, `deep_${seed}.ts`);
      fs.writeFileSync(file, randomProgram(r, 60));
      files.push(file);
    }
    try {
      await assertParity(files, "deep fuzz corpus");
    } finally {
      fs.rmSync(path.join(ROOT, ".fuzz-corpus-deep"), {
        recursive: true,
        force: true,
      });
    }
  }, 600_000);
});
