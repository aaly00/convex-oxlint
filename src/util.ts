import path from "node:path";

/**
 * List of Convex function registrars to check for.
 *
 * Ported verbatim from `@convex-dev/eslint-plugin`'s `src/util.ts`.
 */
export const CONVEX_REGISTRARS = [
  "query",
  "mutation",
  "action",
  "internalQuery",
  "internalMutation",
  "internalAction",
];

const ENTRY_POINT_EXTENSIONS = [
  // ESBuild js loader
  ".js",
  ".mjs",
  ".cjs",
  // ESBuild ts loader
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  // ESBuild jsx loader
  ".jsx",
  // ESBuild supports css, text, json, and more but these file types are not
  // allowed to define entry points.
];

/**
 * Assuming this is only called on files in the convex directory,
 * check return true if the file looks like an entry point.
 * This logic matches convex/src/bundler/index.ts.
 */
export function isEntryPoint(fpath: string): boolean {
  const parsedPath = path.parse(fpath);
  const base = parsedPath.base;

  if (!ENTRY_POINT_EXTENSIONS.some((ext) => fpath.endsWith(ext))) {
    return false;
  } else if (fpath.includes("_generated" + path.sep)) {
    return false;
  } else if (base.startsWith(".")) {
    return false;
  } else if (base.startsWith("#")) {
    return false;
  } else if (base === "schema.ts" || base === "schema.js") {
    return false;
  } else if ((base.match(/\./g) || []).length > 1) {
    return false;
  } else if (fpath.includes(" ")) {
    return false;
  } else {
    return true;
  }
}

/**
 * Documentation URL for a rule, matching the URLs the ESLint plugin puts in
 * `meta.docs.url` via `ESLintUtils.RuleCreator`.
 */
export function docsUrl(name: string): string {
  return `https://docs.convex.dev/eslint#${name}`;
}
