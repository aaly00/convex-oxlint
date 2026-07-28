// Generates a combinatorial fixture corpus so parity is proven over the whole
// input space each rule branches on, not just hand-picked examples.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outRoot = path.join(here, "generated");

fs.rmSync(outRoot, { recursive: true, force: true });

const REGISTRARS = [
  "query",
  "mutation",
  "action",
  "internalQuery",
  "internalMutation",
  "internalAction",
  // Not a registrar — must never be reported.
  "notARegistrar",
];

// Ways of introducing the declaration; only the exported forms are in scope.
const EXPORT_FORMS = [
  { id: "export", wrap: (d) => `export ${d}` },
  { id: "plain", wrap: (d) => d },
  { id: "exportDefaultSeparate", wrap: (d) => `${d}\nexport default helper;` },
  { id: "declareModule", wrap: (d) => `declare module "x" {\n  export ${d}\n}` },
  { id: "namespace", wrap: (d) => `namespace NS {\n  export ${d}\n}` },
  { id: "let", wrap: (d) => `export ${d.replace(/^const /, "let ")}` },
  { id: "var", wrap: (d) => `export ${d.replace(/^const /, "var ")}` },
];

// Argument shapes handed to the registrar.
const ARG_FORMS = [
  { id: "arrow0", src: "async (ctx) => 1" },
  { id: "arrow2", src: "async (ctx, args) => args" },
  { id: "arrow2EmptyObj", src: "async (ctx, {}) => 1" },
  { id: "arrow2Obj", src: "async (ctx, { a }) => a" },
  { id: "arrow2Typed", src: "async (ctx, args: { a: string }) => args" },
  { id: "arrow3", src: "async (ctx, args, extra) => args" },
  { id: "arrowRest", src: "async (ctx, ...rest) => rest" },
  { id: "arrowDefault", src: "async (ctx, args = {}) => args" },
  { id: "fnExpr0", src: "function (ctx) { return 1; }" },
  { id: "fnExpr2", src: "function (ctx, args) { return args; }" },
  { id: "fnExprNamed", src: "function h(ctx, args) { return args; }" },
  { id: "objEmpty", src: "{}" },
  { id: "objArgs", src: "{ args: {} }" },
  { id: "objArgsHandler", src: "{ args: {}, handler: async (ctx, a) => a }" },
  { id: "objHandler0", src: "{ handler: async (ctx) => 1 }" },
  { id: "objHandler2", src: "{ handler: async (ctx, args) => args }" },
  { id: "objHandler2Empty", src: "{ handler: async (ctx, {}) => 1 }" },
  { id: "objHandlerFn", src: "{ handler: function (ctx, args) { return args; } }" },
  { id: "objHandlerNotFn", src: "{ handler: someHandler }" },
  { id: "objArgsComputed", src: '{ ["args"]: {}, handler: async (ctx) => 1 }' },
  { id: "objArgsString", src: '{ "args": {}, handler: async (ctx) => 1 }' },
  { id: "objArgsShorthand", src: "{ args, handler: async (ctx) => 1 }" },
  { id: "objSpread", src: "{ ...base, handler: async (ctx) => 1 }" },
  { id: "objReturns", src: "{ returns: v.null(), handler: async (ctx, a) => a }" },
  { id: "objHandlerMethod", src: "{ handler(ctx, args) { return args; } }" },
  { id: "objNested", src: "{ handler: async (ctx) => ({ args: {} }) }" },
  { id: "identifier", src: "someConfig" },
  { id: "arrayArg", src: "[]" },
  { id: "stringArg", src: '"x"' },
];

const PREAMBLE = `import { v } from "convex/values";
declare function query(...a: unknown[]): unknown;
declare function mutation(...a: unknown[]): unknown;
declare function action(...a: unknown[]): unknown;
declare function internalQuery(...a: unknown[]): unknown;
declare function internalMutation(...a: unknown[]): unknown;
declare function internalAction(...a: unknown[]): unknown;
declare function notARegistrar(...a: unknown[]): unknown;
declare const someHandler: unknown;
declare const someConfig: unknown;
declare const base: Record<string, unknown>;
declare const args: Record<string, unknown>;
declare const helper: unknown;
`;

function writeFile(rel, contents) {
  const abs = path.join(outRoot, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contents);
}

// ---------------------------------------------------------------------------
// 1. Registrar declarations: registrar x arg shape x export form
// ---------------------------------------------------------------------------
let n = 0;
for (const reg of REGISTRARS) {
  for (const form of EXPORT_FORMS) {
    const lines = [PREAMBLE];
    for (const arg of ARG_FORMS) {
      lines.push(
        `// ${reg} / ${form.id} / ${arg.id}`,
        form.wrap(`const ${arg.id}_${n++} = ${reg}(${arg.src});`),
        "",
      );
    }
    writeFile(`convex/decl_${reg}_${form.id}.ts`, lines.join("\n"));
  }
}

// Multiple arguments to a registrar (rule requires exactly one).
{
  const lines = [PREAMBLE];
  let i = 0;
  for (const arg of ARG_FORMS) {
    lines.push(
      `export const multi_${i++} = query(${arg.src}, extra);`,
      `export const zero_${i++} = query();`,
      `export const spreadArg_${i++} = query(...spread);`,
    );
  }
  lines.push("declare const extra: unknown;", "declare const spread: unknown[];");
  writeFile("convex/decl_arity.ts", lines.join("\n"));
}

// Declarator shapes that must not match the rules' selectors: no initializer,
// destructuring, non-Identifier callees, `new`, optional calls, class fields.
{
  const lines = [
    PREAMBLE,
    "declare const obj: any;",
    "declare const arr: any[];",
    "export let uninitialized;",
    "export let uninitializedTyped: unknown;",
    "export var uninitializedVar;",
    "export const { destructured } = obj;",
    "export const { renamed: alias } = obj;",
    "export const [firstEl] = arr;",
    "export const [, secondEl] = arr;",
    "export const { nested: { deep } } = obj;",
    "export const { withDefault = query(async (ctx) => 1) } = obj;",
    "export const [defaulted = query(async (ctx) => 1)] = arr;",
    "export const newExpr = new (query as any)(async (ctx) => 1);",
    "export const memberCallee = obj.query(async (ctx) => 1);",
    "export const parenCallee = (query)(async (ctx) => 1);",
    "export const optionalCall = query?.(async (ctx) => 1);",
    "export const seqCallee = (0, query)(async (ctx) => 1);",
    "export const awaited = await query(async (ctx) => 1);",
    "export const asCast = query(async (ctx) => 1) as unknown;",
    "export const nonNull = query(async (ctx) => 1)!;",
    "export const tagged = query`template`;",
    "export const chainedCall = query(async (ctx) => 1).then();",
    "export class WithFields {",
    "  static staticField = query(async (ctx) => 1);",
    "  instanceField = query(async (ctx) => 1);",
    "}",
    "export function inFunction() {",
    "  const local = query(async (ctx) => 1);",
    "  return local;",
    "}",
    "export const arrowBody = () => {",
    "  const inner = query(async (ctx) => 1);",
    "  return inner;",
    "};",
    "export const multiDeclarator = query(async (ctx) => 1), second = query({});",
    "export const { a: destructuredFromCall } = query(async (ctx) => 1) as any;",
  ];
  writeFile("convex/decl_shapes.ts", lines.join("\n"));
}

// ---------------------------------------------------------------------------
// 2. `.filter()` receivers for no-filter-in-query
// ---------------------------------------------------------------------------
const FILTER_RECEIVERS = [
  'ctx.db.query("m")',
  'db.query("m")',
  'this.db.query("m")',
  'a.b.c.db.query("m")',
  'db.privateSystem.query("_t")',
  'ctx.db.privateSystem.query("_t")',
  'a.db.privateSystem.query("_t")',
  'privateSystem.query("_t")',
  'other.query("m")',
  'query("m")',
  'ctx.notDb.query("m")',
  'ctx.db.query("m").withIndex("by_a")',
  'ctx.db.query("m").withIndex("by_a", (q) => q)',
  'ctx.db.query("m").order("desc")',
  'ctx.db.query("m").withSearchIndex("s", (q) => q)',
  'ctx.db.query("m").filter((q) => q)',
  'ctx.db.query("m").order("desc").withIndex("i").filter((q) => q)',
  'ctx.db.query("m").collect()',
  'ctx.db.query("m").take(5)',
  'ctx.db.query("m").first()',
  'ctx.db.query("m").unique()',
  'ctx.db.query("m").paginate(o)',
  'await ctx.db.query("m").collect()',
  '(await ctx.db.query("m").collect())',
  'ctx.db.query("m")!',
  'ctx.db.query("m") as any',
  '<any>ctx.db.query("m")',
  'ctx.db?.query("m")',
  'ctx?.db?.query("m")',
  '(ctx.db.query("m"))',
  '((ctx.db.query("m")))',
  '(await ctx.db.query("m"))',
  'ctx.db.query("m").unknownMethod()',
  'ctx.db.query("m").unknownMethod().another()',
  'ctx.db["query"]("m")',
  "ctx.db.query()",
  "[1, 2, 3]",
  "someArray",
  "ctx.db",
  'ctx.db.query("m").withIndex("i").order("desc").filter((q) => q).order("asc")',
];
{
  const lines = [
    "declare const ctx: any;",
    "declare const db: any;",
    "declare const a: any;",
    "declare const other: any;",
    "declare const privateSystem: any;",
    "declare const someArray: any[];",
    "declare const o: any;",
    "declare const filter: any;",
    "declare function query(...a: unknown[]): any;",
    "export class K { db: any; m() { return this.db.query('m'); } }",
    "",
  ];
  FILTER_RECEIVERS.forEach((recv, i) => {
    lines.push(`export const f${i} = (${recv}).filter((q) => q);`);
  });
  // computed / non-identifier property accesses
  lines.push(
    'export const c0 = ctx.db.query("m")[filter]((q) => q);',
    'export const c1 = ctx.db.query("m")["filter"]((q) => q);',
    'export const c2 = ctx.db.query("m").filter;',
    'export const c3 = ctx.db.query("m").filter?.((q) => q);',
    'export const c4 = ctx.db.query("m")?.filter((q) => q);',
    'export const c5 = new (ctx.db.query("m").filter)();',
    'export const c6 = ctx.db.query("m").filter((q) => q).filter((q) => q);',
  );
  writeFile("convex/filters_gen.ts", lines.join("\n"));
}

// ---------------------------------------------------------------------------
// 3. Files that exercise `isEntryPoint` gating
// ---------------------------------------------------------------------------
const ENTRY_SRC = `declare function query(...a: unknown[]): unknown;
export const old = query(async (ctx) => 1);
export const obj = query({ handler: async (ctx) => 1 });
declare const ctx: any;
export const filtered = ctx.db.query("m").filter((q) => q);
`;
// The same fixture without TypeScript-only syntax, so that `.js`/`.jsx`/`.mjs`/
// `.cjs` files parse under both a JavaScript parser (oxlint) and
// @typescript-eslint/parser (ESLint).
const ENTRY_SRC_JS = `export const old = query(async (ctx) => 1);
export const obj = query({ handler: async (ctx) => 1 });
export const filtered = ctx.db.query("m").filter((q) => q);
`;
const JS_EXTENSIONS = new Set([".js", ".jsx", ".mjs"]);
// `.cjs` is CommonJS: `export` is a syntax error there for a JavaScript parser,
// so this variant exercises the same rule paths without ESM syntax.
const ENTRY_SRC_CJS = `const filtered = ctx.db.query("m").filter((q) => q);
module.exports = { filtered };
`;
const ENTRY_NAMES = [
  "convex/entry_plain.ts",
  "convex/entry_plain.tsx",
  "convex/entry_plain.js",
  "convex/entry_plain.jsx",
  "convex/entry_plain.mjs",
  "convex/entry_plain.cjs",
  "convex/entry_plain.mts",
  "convex/entry_plain.cts",
  "convex/schema.ts",
  "convex/.hidden.ts",
  "convex/#hash.ts",
  "convex/two.dots.ts",
  "convex/with space.ts",
  "convex/_generated/server.ts",
  "convex/_generated/nested/deep.ts",
  "convex/not_generated_prefix.ts",
  "convex/sub/_generated_lookalike.ts",
  "convex/sub/nested/deep.ts",
  "convex/types.d.ts",
  "convex/no_extension",
  "convex/UPPER.TS",
  "src/outside.ts",
  "convex_like/inside.ts",
];
for (const name of ENTRY_NAMES) {
  const ext = path.extname(name);
  writeFile(
    name,
    ext === ".cjs"
      ? ENTRY_SRC_CJS
      : JS_EXTENSIONS.has(ext)
        ? ENTRY_SRC_JS
        : ENTRY_SRC,
  );
}

// ---------------------------------------------------------------------------
// 4. `use node` import graph for import-wrong-runtime
// ---------------------------------------------------------------------------
writeFile(
  "convex/node_actions.ts",
  `"use node";\nimport nodeFs from "node:fs";\nexport const x = nodeFs;\n`,
);
writeFile(
  "convex/node_actions_late.ts",
  `${"// padding comment line\n".repeat(12)}"use node";\nexport const y = 1;\n`,
);
writeFile("convex/plain_module.ts", `export const z = 1;\n`);
writeFile("convex/dir_module/index.ts", `"use node";\nexport const w = 1;\n`);
writeFile(
  "convex/importer.ts",
  [
    'import { x } from "./node_actions";',
    'import { y } from "./node_actions_late";',
    'import { z } from "./plain_module";',
    'import { w } from "./dir_module";',
    'import { q } from "./missing_module";',
    'import fsx from "node:fs";',
    'import ext from "some-package";',
    'import up from "../outside_convex";',
    'import type { T } from "./node_actions";',
    'export * from "./plain_module";',
    "export const all = [x, y, z, w, q, fsx, ext, up];",
    "declare module './missing_module' { export const q: number }",
  ].join("\n"),
);
writeFile("outside_convex.ts", "export const up = 1;\n");

// ---------------------------------------------------------------------------
// 5. Unicode / line-ending / BOM handling, to compare reported spans
// ---------------------------------------------------------------------------
writeFile(
  "convex/unicode.ts",
  `declare function query(...a: unknown[]): unknown;
const emoji = "🎉🎉🎉 ünïcödé 中文";
export const afterUnicode = query(async (ctx) => emoji);
export const objAfterUnicode = query({ handler: async (ctx, args) => args });
declare const ctx: any;
export const filterAfterUnicode = ctx.db.query("🎉").filter((q) => q);
`,
);
fs.writeFileSync(
  path.join(outRoot, "convex/bom_crlf.ts"),
  "﻿" +
    'declare function query(...a: unknown[]): unknown;\r\nexport const a = query(async (ctx) => 1);\r\nexport const b = query({ handler: async (ctx, args) => args });\r\n',
);

console.log(
  `generated ${fs.readdirSync(path.join(outRoot, "convex")).length} convex fixtures under ${outRoot}`,
);
