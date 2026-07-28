// Runs the official ESLint plugin and this oxlint port over identical inputs
// and normalizes both into one comparable diagnostic shape.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import tsParser from "@typescript-eslint/parser";
import convexEslintPlugin from "@convex-dev/eslint-plugin";

export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const OXLINT_BIN = path.join(ROOT, "node_modules/.bin/oxlint");

export const ALL_RULES = [
  "no-old-registered-function-syntax",
  "require-args-validator",
  "import-wrong-runtime",
  "explicit-table-ids",
  "no-filter-in-query",
  "no-collect-in-query",
];

/** Severities used by the parity profiles. ESLint numeric <-> oxlint string. */
const SEVERITY_NAME = { 1: "warning", 2: "error" };

// ---------------------------------------------------------------------------
// Position mapping
// ---------------------------------------------------------------------------

/**
 * Builds an offset -> {line, column} mapper for a source text.
 *
 * ESLint reports 1-based lines and 1-based columns counted in UTF-16 code
 * units. Oxlint reports a byte offset plus a 1-based line/column. Both mappers
 * are built here and the correct one is selected by checking which reproduces
 * oxlint's own reported line/column — so the choice is verified per run rather
 * than assumed.
 */
export function makeOffsetMapper(text) {
  // ESLint/espree treat \n, \r\n, \r, U+2028 and U+2029 as line terminators.
  const lineBreak = /\r\n|[\r\n\u2028\u2029]/g;
  const utf16LineStarts = [0];
  let m;
  lineBreak.lastIndex = 0;
  while ((m = lineBreak.exec(text)) !== null) {
    utf16LineStarts.push(m.index + m[0].length);
  }

  const bytes = Buffer.from(text, "utf8");
  // byte offset of each line start
  const byteLineStarts = utf16LineStarts.map((u16) =>
    Buffer.byteLength(text.slice(0, u16), "utf8"),
  );

  function utf16FromUtf16(offset) {
    let lo = 0;
    let hi = utf16LineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (utf16LineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - utf16LineStarts[lo] + 1 };
  }

  function lineOfByte(byteOffset) {
    let lo = 0;
    let hi = byteLineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (byteLineStarts[mid] <= byteOffset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  // Byte offset -> position with the column counted in UTF-16 code units,
  // which is how ESLint counts columns.
  function utf16FromByte(byteOffset) {
    const lo = lineOfByte(byteOffset);
    const sliceUtf16 = bytes
      .subarray(byteLineStarts[lo], byteOffset)
      .toString("utf8").length;
    return { line: lo + 1, column: sliceUtf16 + 1 };
  }

  // Byte offset -> position with the column counted in UTF-8 bytes, which is
  // how oxlint's JSON output reports columns. Used only to confirm that
  // oxlint's `span.offset` really is a byte offset.
  function byteFromByte(byteOffset) {
    const lo = lineOfByte(byteOffset);
    return { line: lo + 1, column: byteOffset - byteLineStarts[lo] + 1 };
  }

  return { utf16FromUtf16, utf16FromByte, byteFromByte };
}

// ---------------------------------------------------------------------------
// ESLint runner
// ---------------------------------------------------------------------------

export async function loadPlugin(plugin) {
  return plugin === "official"
    ? convexEslintPlugin
    : (await import(path.join(ROOT, "dist/esm/index.js"))).default;
}

/**
 * ESLint flat config used by every ESLint-side run.
 *
 * The extension patterns must be explicit: ESLint treats `files: ["**\/*"]` as
 * a "universal pattern" that does not by itself make a file lintable, which
 * silently produces zero results.
 */
export function eslintConfigFor(
  pluginObject,
  rules,
  {
    typeAware = false,
    tsconfigRootDir = ROOT,
    reportUnusedDisableDirectives = "off",
  } = {},
) {
  return [
    {
      // ESLint 9 defaults this to "warn" while oxlint defaults it off. It is a
      // linter-level setting rather than plugin behavior, so rule-parity runs
      // pin it to "off" on both sides; `directives-and-presets.test.ts` covers
      // it being switched on explicitly.
      linterOptions: { reportUnusedDisableDirectives },
    },
    {
      files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
      languageOptions: {
        parser: tsParser,
        parserOptions: typeAware ? { projectService: true, tsconfigRootDir } : {},
      },
      plugins: { "@convex-dev": pluginObject },
      rules,
    },
    {
      files: ["**/*.js", "**/*.jsx", "**/*.mjs", "**/*.cjs"],
      languageOptions: { parser: tsParser, parserOptions: {} },
      plugins: { "@convex-dev": pluginObject },
      rules,
    },
  ];
}

/**
 * @param {object} opts
 * @param {"official"|"port"} opts.plugin which plugin implementation to load
 * @param {Record<string, unknown>} opts.rules rule id -> severity/options
 * @param {boolean} [opts.typeAware] enable `projectService` type information
 */
export async function runEslint({ plugin, rules, files, typeAware = false }) {
  const pluginObject = await loadPlugin(plugin);

  const eslint = new ESLint({
    cwd: ROOT,
    overrideConfigFile: true,
    ignore: false,
    overrideConfig: eslintConfigFor(pluginObject, rules, { typeAware }),
  });

  const results = await eslint.lintFiles(files);
  const out = [];
  for (const result of results) {
    const text = fs.readFileSync(result.filePath, "utf8");
    const map = makeOffsetMapper(text);
    for (const msg of result.messages) {
      if (msg.fatal) {
        out.push({
          file: path.relative(ROOT, result.filePath),
          fatal: true,
          message: msg.message,
          line: msg.line,
          column: msg.column,
        });
        continue;
      }
      out.push({
        file: path.relative(ROOT, result.filePath),
        ruleId: msg.ruleId,
        severity: SEVERITY_NAME[msg.severity] ?? String(msg.severity),
        message: msg.message,
        line: msg.line,
        column: msg.column,
        endLine: msg.endLine ?? null,
        endColumn: msg.endColumn ?? null,
        fix: msg.fix
          ? { range: msg.fix.range, text: msg.fix.text }
          : null,
        suggestions: (msg.suggestions ?? []).map((s) => ({
          desc: s.desc,
          fix: { range: s.fix.range, text: s.fix.text },
        })),
        _map: map,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Oxlint runner
// ---------------------------------------------------------------------------

export function runOxlint({ rules, files, cwd = ROOT, extraConfig = {} }) {
  const configPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "oxparity-")),
    ".oxlintrc.json",
  );
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      // Turn every built-in Rust rule off so only plugin diagnostics remain.
      categories: {},
      plugins: [],
      jsPlugins: [path.join(ROOT, "dist/esm/index.js")],
      rules,
      ...extraConfig,
    }),
  );

  const args = [
    "--config",
    configPath,
    "--format",
    "json",
    "--no-ignore",
    "-A",
    "all",
    ...files.map((f) => path.relative(cwd, f)),
  ];

  let stdout;
  try {
    stdout = execFileSync(OXLINT_BIN, args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      env: {
        ...process.env,
        CONVEX_OXLINT_SILENCE_TYPE_AWARE_NOTICE: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    // oxlint exits non-zero when it reports errors; that is expected.
    if (err.stdout == null) throw err;
    stdout = err.stdout;
  }

  const parsed = JSON.parse(stdout);
  const out = [];
  for (const d of parsed.diagnostics ?? []) {
    const abs = path.resolve(cwd, d.filename);
    const text = fs.readFileSync(abs, "utf8");
    const map = makeOffsetMapper(text);
    const span = d.labels?.[0]?.span;
    // `code` is `@convex-dev(rule-name)`; ESLint spells it `@convex-dev/rule-name`.
    const ruleId = d.code
      ? d.code.replace(/^([^(]+)\((.+)\)$/, "$1/$2")
      : null;
    out.push({
      file: path.relative(ROOT, abs),
      ruleId,
      severity: d.severity,
      message: d.message,
      span,
      reportedLine: span?.line ?? null,
      reportedColumn: span?.column ?? null,
      _map: map,
      _text: text,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Normalization to a comparable shape
// ---------------------------------------------------------------------------

/**
 * Chooses the offset interpretation (UTF-16 vs UTF-8 bytes) that reproduces
 * oxlint's own reported line/column, then derives start and end positions.
 */
export function normalizeOxlint(diagnostics) {
  return diagnostics.map((d) => {
    const { _map: map, span } = d;
    if (!span) {
      return {
        file: d.file,
        ruleId: d.ruleId,
        severity: d.severity,
        message: d.message,
        line: null,
        column: null,
        endLine: null,
        endColumn: null,
      };
    }
    // Verify, per diagnostic, that `span.offset` is a UTF-8 byte offset by
    // reconstructing oxlint's own reported line/column from it. If oxlint ever
    // changes the unit, this throws instead of silently comparing garbage.
    const asBytes = map.byteFromByte(span.offset);
    if (asBytes.line !== span.line || asBytes.column !== span.column) {
      throw new Error(
        `Could not reconcile oxlint span for ${d.file}: offset=${span.offset} ` +
          `reported=${span.line}:${span.column} ` +
          `derived-as-bytes=${asBytes.line}:${asBytes.column}`,
      );
    }
    const start = map.utf16FromByte(span.offset);
    const end = map.utf16FromByte(span.offset + span.length);
    return {
      file: d.file,
      ruleId: d.ruleId,
      severity: d.severity,
      message: d.message,
      line: start.line,
      column: start.column,
      endLine: end.line,
      endColumn: end.column,
    };
  });
}

export function normalizeEslint(diagnostics) {
  return diagnostics.map((d) => ({
    file: d.file,
    ruleId: d.ruleId,
    severity: d.severity,
    message: d.message,
    line: d.line,
    column: d.column,
    endLine: d.endLine,
    endColumn: d.endColumn,
  }));
}

const sortKey = (d) =>
  [
    d.file,
    String(d.line ?? 0).padStart(8, "0"),
    String(d.column ?? 0).padStart(8, "0"),
    d.ruleId ?? "",
    d.message ?? "",
  ].join(" ");

export function sortDiagnostics(list) {
  return [...list].sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));
}

/** Strips helper fields so two lists can be deep-compared. */
export function comparable(list) {
  return sortDiagnostics(list).map(
    ({ file, ruleId, severity, message, line, column, endLine, endColumn }) => ({
      file,
      ruleId,
      severity,
      message,
      line,
      column,
      endLine,
      endColumn,
    }),
  );
}

// ---------------------------------------------------------------------------
// --fix comparison
// ---------------------------------------------------------------------------

/** Copies `files` into a temp dir preserving relative layout. */
export function stageFiles(files, label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `oxfix-${label}-`));
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    const dest = path.join(dir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(f, dest);
  }
  return dir;
}

export async function eslintFixOutputs({ plugin, rules, files }) {
  const dir = stageFiles(files, `eslint-${plugin}`);
  const staged = files.map((f) => path.join(dir, path.relative(ROOT, f)));
  const pluginObject = await loadPlugin(plugin);
  const eslint = new ESLint({
    cwd: dir,
    overrideConfigFile: true,
    ignore: false,
    fix: true,
    overrideConfig: eslintConfigFor(pluginObject, rules, {
      tsconfigRootDir: dir,
    }),
  });
  const results = await eslint.lintFiles(staged);
  await ESLint.outputFixes(results);
  return readTree(dir);
}

export function oxlintFixOutputs({ rules, files }) {
  const dir = stageFiles(files, "oxlint");
  const staged = files.map((f) => path.join(dir, path.relative(ROOT, f)));
  const configPath = path.join(dir, ".oxlintrc.json");
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      categories: {},
      plugins: [],
      jsPlugins: [path.join(ROOT, "dist/esm/index.js")],
      rules,
    }),
  );
  const args = [
    "--config",
    configPath,
    "--fix",
    "--format",
    "json",
    "--no-ignore",
    "-A",
    "all",
    ...staged.map((f) => path.relative(dir, f)),
  ];
  try {
    execFileSync(OXLINT_BIN, args, {
      cwd: dir,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, CONVEX_OXLINT_SILENCE_TYPE_AWARE_NOTICE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    if (err.stdout == null) throw err;
  }
  return readTree(dir);
}

function readTree(dir) {
  const out = {};
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name !== ".oxlintrc.json")
        out[path.relative(dir, p)] = fs.readFileSync(p, "utf8");
    }
  };
  walk(dir);
  return out;
}

// ---------------------------------------------------------------------------
// Corpus discovery
// ---------------------------------------------------------------------------

const LINTABLE = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
]);

export function collectFixtures(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (LINTABLE.has(path.extname(entry.name))) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

export function rulesForProfile(severity = "error", options = undefined) {
  const rules = {};
  for (const r of ALL_RULES) {
    rules[`@convex-dev/${r}`] =
      options && r === "require-args-validator"
        ? [severity, options]
        : severity;
  }
  return rules;
}
