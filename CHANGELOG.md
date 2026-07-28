# Changelog

## 1.0.0

Initial release: an oxlint port of `@convex-dev/eslint-plugin@2.0.0`.

- All six upstream rules are registered under their original
  `@convex-dev/<rule>` ids, so existing `// eslint-disable-next-line` comments
  and rule references keep working.
- `no-old-registered-function-syntax`, `require-args-validator` and
  `import-wrong-runtime` are exact ports, including autofix output.
- `no-filter-in-query` implements upstream's AST detection path, which is what
  ESLint executes when type-aware linting is off.
- `explicit-table-ids` and `no-collect-in-query` are registered but cannot
  report, because oxlint exposes no TypeScript parser services to JS plugins.
  Enabling either prints one explanatory line to stderr. See PARITY.md.
- Ships `recommended` (a 1:1 mirror of upstream's config) and
  `recommended-oxlint-only` presets, as both `.oxlintrc.json` files and config
  objects for `oxlint.config.ts`.
