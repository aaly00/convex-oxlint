// Deep-diffs the AST oxlint exposes to JS plugins against @typescript-eslint/parser's
// TSESTree AST, restricted to the properties the Convex rules actually read.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { binPath, fileUrl, runNode } from "../../scripts/exec.mjs";
import * as tsParser from "@typescript-eslint/parser";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const fixturesDir = path.join(here, "fixtures");
const outDir = path.join(root, ".astdump");

fs.rmSync(outDir, { recursive: true, force: true });

// 1. Have oxlint dump its AST.
//
// The config lives outside `fixtures/` on purpose: a stray `.oxlintrc.json`
// in there would be picked up as a nested config when linting this repo and
// would silently override the root config's ignorePatterns.
const configPath = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "astdiff-")),
  ".oxlintrc.json",
);
fs.writeFileSync(
  configPath,
  JSON.stringify(
    {
      categories: {},
      plugins: [],
      jsPlugins: [fileUrl(path.join(here, "dump-plugin.js"))],
      rules: { "astdump/dump": "off" },
      overrides: [
        { files: ["**/*.ts", "**/*.tsx"], rules: { "astdump/dump": "warn" } },
      ],
    },
    null,
    2,
  ),
);
runNode(
  binPath("oxlint", root),
  ["--config", configPath, "--silent", "-A", "all", "--no-ignore"],
  {
    cwd: fixturesDir,
    env: { ...process.env, OXAST_OUT: outDir },
    stdio: "inherit",
  },
);

// 2. Walk both ASTs in lockstep.
//
// Only compare properties that matter for rule behavior. Parsers legitimately
// differ on incidental metadata (comments, `loc` line/col wrappers on some
// nodes, TS-only decoration), and the Convex rules never read those.
const COMPARED = new Set([
  "type",
  "name",
  "value",
  "computed",
  "optional",
  "kind",
  "operator",
  "prefix",
  "method",
  "shorthand",
  "async",
  "generator",
  "expression",
  "declare",
  "range",
]);

// `tokens`/`comments` are lexer output rather than AST structure, and no Convex
// rule reads them. They are compared separately so genuine AST diffs stay visible.
const NON_AST_KEYS = new Set(["tokens", "comments"]);

// Child keys, by node type, that we recurse into.
function childKeys(node) {
  const keys = [];
  for (const k of Object.keys(node)) {
    if (k === "parent" || k === "loc" || k === "range") continue;
    if (NON_AST_KEYS.has(k)) continue;
    const v = node[k];
    if (v && typeof v === "object") keys.push(k);
  }
  return keys;
}

const diffs = [];
function walk(a, b, pathStr) {
  if (a === null || a === undefined || b === null || b === undefined) {
    if ((a ?? null) !== (b ?? null)) {
      const aNull = a === null || a === undefined;
      const bNull = b === null || b === undefined;
      if (aNull !== bNull) {
        diffs.push({
          path: pathStr,
          kind: "nullness",
          ox: aNull ? "nullish" : a?.type,
          ts: bNull ? "nullish" : b?.type,
        });
      }
    }
    return;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      diffs.push({ path: pathStr, kind: "arrayness" });
      return;
    }
    if (a.length !== b.length) {
      diffs.push({
        path: pathStr,
        kind: "length",
        ox: a.length,
        ts: b.length,
      });
    }
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      walk(a[i], b[i], `${pathStr}[${i}]`);
    }
    return;
  }
  if (typeof a !== "object" || typeof b !== "object") {
    if (a !== b) diffs.push({ path: pathStr, kind: "scalar", ox: a, ts: b });
    return;
  }

  for (const k of COMPARED) {
    if (!(k in a) && !(k in b)) continue;
    const av = a[k];
    const bv = b[k];
    if (av && typeof av === "object") continue; // handled by recursion
    if (k === "range") continue;
    if (av !== bv) {
      // `value` on literals: BigInt/RegExp serialize differently; skip objects.
      diffs.push({ path: `${pathStr}.${k}`, kind: "prop", ox: av, ts: bv });
    }
  }
  if (Array.isArray(a.range) && Array.isArray(b.range)) {
    if (a.range[0] !== b.range[0] || a.range[1] !== b.range[1]) {
      diffs.push({
        path: `${pathStr}.range`,
        kind: "range",
        ox: a.range,
        ts: b.range,
        nodeType: a.type,
      });
    }
  }

  const aKeys = new Set(childKeys(a));
  const bKeys = new Set(childKeys(b));
  const shared = [...aKeys].filter((k) => bKeys.has(k));
  const onlyOx = [...aKeys].filter((k) => !bKeys.has(k));
  const onlyTs = [...bKeys].filter((k) => !aKeys.has(k));
  if (onlyOx.length || onlyTs.length) {
    diffs.push({
      path: pathStr,
      kind: "keys",
      nodeType: a.type,
      onlyOxlint: onlyOx,
      onlyTsEslint: onlyTs,
    });
  }
  for (const k of shared) walk(a[k], b[k], `${pathStr}.${k}`);
}

let files = 0;
for (const f of fs.readdirSync(outDir)) {
  const dump = JSON.parse(fs.readFileSync(path.join(outDir, f), "utf8"));
  const tsAst = tsParser.parse(dump.text, {
    range: true,
    loc: true,
    comment: false,
    jsx: f.endsWith("tsx.json"),
  });
  walk(dump.ast, tsAst, f);
  files++;
  console.log(`compared ${f}  isESTree=${dump.isESTree}`);
}

console.log(`\n${files} file(s), ${diffs.length} raw difference(s)`);
const byKind = {};
for (const d of diffs) byKind[d.kind] = (byKind[d.kind] ?? 0) + 1;
console.log(byKind);
fs.writeFileSync(
  path.join(root, ".astdump-diffs.json"),
  JSON.stringify(diffs, null, 2),
);
for (const d of diffs.slice(0, 40)) console.log(JSON.stringify(d));
