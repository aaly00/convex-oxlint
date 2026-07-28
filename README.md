# convex-oxlint

An [oxlint][oxlint] port of [`@convex-dev/eslint-plugin`][upstream] — same rule
ids, same messages, same source spans, same autofixes. Built to be a drop-in
replacement, and tested as one against the real ESLint plugin on every commit.

```bash
npm install --save-dev oxlint convex-oxlint
```

**~6–10x faster than ESLint** on the same files, producing the same
diagnostics. Measured with `npm run bench`:

| Corpus | `eslint` + `@convex-dev/eslint-plugin` | `oxlint` + `convex-oxlint` | Speedup | Diagnostics |
|---|---|---|---|---|
| 500 files | 1476 ms | 225 ms | **6.6x** | 2000 = 2000 |
| 2000 files | 5159 ms | 534 ms | **9.7x** | 8000 = 8000 |

> **Read [PARITY.md](./PARITY.md) before switching.** If you use ESLint's
> type-aware linting, three rules lose detections and you should keep them on
> ESLint. Without type-aware linting, parity is exact. Nothing is hidden: the
> plugin tells you at runtime when a rule it cannot enforce is enabled.

## Setup

### `.oxlintrc.json`

Extend the shipped preset, which mirrors the ESLint plugin's `recommended`
config exactly — same rules, same severities, scoped to the same
`**/convex/**/*.ts` glob:

```json
{
  "extends": ["./node_modules/convex-oxlint/oxlintrc.recommended.json"]
}
```

Or configure it by hand:

```json
{
  "jsPlugins": ["convex-oxlint"],
  "overrides": [
    {
      "files": ["**/convex/**/*.ts"],
      "rules": {
        "@convex-dev/import-wrong-runtime": "off",
        "@convex-dev/no-old-registered-function-syntax": "error",
        "@convex-dev/require-args-validator": "error",
        "@convex-dev/explicit-table-ids": "error",
        "@convex-dev/no-filter-in-query": "warn"
      }
    }
  ]
}
```

### `oxlint.config.ts`

```ts
import { defineConfig } from "oxlint";
import { recommended } from "convex-oxlint/configs";

export default defineConfig({ extends: [recommended] });
```

### Avoiding the type-aware notice

`recommended` includes `@convex-dev/explicit-table-ids`, which oxlint cannot
enforce, so the plugin prints one explanatory line to stderr. If you have
decided to keep that rule on ESLint, use the preset that leaves it out:

```json
{
  "extends": [
    "./node_modules/convex-oxlint/oxlintrc.recommended-oxlint-only.json"
  ]
}
```

```ts
import { recommendedOxlintOnly } from "convex-oxlint/configs";
```

Or set `CONVEX_OXLINT_SILENCE_TYPE_AWARE_NOTICE=1`.

## Rules

Rule ids are unchanged from the ESLint plugin, so your existing
`// eslint-disable-next-line @convex-dev/…` comments keep working — oxlint
honours `eslint-disable` directives by default.

| Rule | `recommended` | What it does | Oxlint support |
|---|---|---|---|
| [`@convex-dev/no-old-registered-function-syntax`](https://docs.convex.dev/eslint#no-old-registered-function-syntax) | `error` | Requires the object syntax for registered Convex functions | ✅ full, autofixable |
| [`@convex-dev/require-args-validator`](https://docs.convex.dev/eslint#require-args-validator) | `error` | Requires an `args` validator on every registered function | ✅ full, autofixable |
| [`@convex-dev/no-filter-in-query`](https://docs.convex.dev/eslint#no-filter-in-query) | `warn` | Discourages `.filter()` on a Convex query | ⚠️ AST detection only |
| [`@convex-dev/import-wrong-runtime`](https://docs.convex.dev/eslint#no-import-use-node) | `off` | Only `"use node"` modules may import `"use node"` modules | ✅ full |
| [`@convex-dev/explicit-table-ids`](https://docs.convex.dev/eslint#explicit-table-ids) | `error` | Requires an explicit table name in `db.get`/`patch`/`replace`/`delete` | ⛔ needs type info |
| [`@convex-dev/no-collect-in-query`](https://docs.convex.dev/eslint#no-collect-in-query) | — | Discourages `.collect()`; prefer `.take()`/`.paginate()` | ⛔ needs type info |

`require-args-validator` takes the same option as upstream:

```json
{ "rules": { "@convex-dev/require-args-validator": ["error", { "ignoreUnusedArguments": true }] } }
```

## Running both linters during migration

Oxlint is fast enough to run on every keystroke while ESLint handles the
type-aware rules. Turn the ported rules off in your ESLint config and keep only
what oxlint cannot do:

```js
// eslint.config.js
import convex from "@convex-dev/eslint-plugin";

export default [
  ...convex.configs.recommended,
  {
    files: ["**/convex/**/*.ts"],
    rules: {
      // Handled by oxlint — far faster there.
      "@convex-dev/no-old-registered-function-syntax": "off",
      "@convex-dev/require-args-validator": "off",
      // Keep these on ESLint: they need type information.
      "@convex-dev/explicit-table-ids": "error",
      "@convex-dev/no-collect-in-query": "error",
      "@convex-dev/no-filter-in-query": "warn",
    },
  },
];
```

## Requirements

- Node.js `^20.19.0 || >=22.12.0` (matching oxlint's own floor)
- oxlint `>=1.76.0`

Ships ESM and CommonJS builds with type declarations.

## Development

```bash
npm install
npm run build      # dual ESM/CJS build via TypeScript 7 (tsc native)
npm test           # 76 tests, including full differential parity vs ESLint
npm run bench      # wall-clock comparison against ESLint
```

`npm test` installs nothing extra at runtime: it drives the real
`@convex-dev/eslint-plugin` through the real ESLint API and the real `oxlint`
binary over identical inputs, and asserts the diagnostics match. See
[PARITY.md](./PARITY.md) for what each suite proves.

## Not to be confused with

[`oxlint-plugin-convex`](https://www.npmjs.com/package/oxlint-plugin-convex) is
a different, unrelated package by another author that detects unused Convex
functions. The two solve different problems and can be used together.

## Relationship to Convex

Unofficial. This is an independent port of Convex's Apache-2.0 licensed ESLint
plugin, and carries the same license. Rule logic, messages and documentation
URLs are derived from that project. Bugs in this port belong in this
repository's issue tracker, not Convex's.

## License

Apache-2.0. See [LICENSE](./LICENSE). Derived from
[`@convex-dev/eslint-plugin`](https://github.com/get-convex/convex-backend/tree/main/npm-packages/%40convex-dev/eslint-plugin),
copyright Convex, Inc., also Apache-2.0.

[oxlint]: https://oxc.rs/docs/guide/usage/linter
[upstream]: https://github.com/get-convex/convex-backend/tree/main/npm-packages/%40convex-dev/eslint-plugin
