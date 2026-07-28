// Cross-platform subprocess helpers shared by the build, the tools and the tests.
//
// Windows has no shebang support, so `execFileSync("node_modules/.bin/oxlint")`
// fails with ENOENT there — and Node refuses to spawn the `.cmd` shims directly
// without a shell (CVE-2024-27980). Every CLI this repo drives is a plain Node
// script, so the portable answer is to run them through `process.execPath`
// rather than relying on shims, shebangs or PATH.
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const IS_WINDOWS = process.platform === "win32";

/** Node entry points of the CLIs, relative to a package root. */
export const BIN = {
  oxlint: "node_modules/oxlint/bin/oxlint",
  eslint: "node_modules/eslint/bin/eslint.js",
  tsc: "node_modules/typescript7/bin/tsc",
};

/** Absolute path to a CLI's Node entry point within `root`. */
export function binPath(name, root = REPO_ROOT) {
  const rel = BIN[name];
  if (!rel) throw new Error(`unknown bin: ${name}`);
  return path.join(root, rel);
}

/**
 * Runs a Node script (`node <script> <args…>`) and returns stdout.
 *
 * Linters exit non-zero when they report problems, which is not a failure for
 * callers here, so stdout is returned in that case too. Genuine spawn errors
 * still throw.
 */
export function runNode(script, args, opts = {}) {
  try {
    return execFileSync(process.execPath, [script, ...args], {
      encoding: "utf8",
      maxBuffer: 512 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      ...opts,
    });
  } catch (err) {
    if (err.stdout == null) throw err;
    return err.stdout;
  }
}

/** Like {@link runNode} but rethrows on a non-zero exit. */
export function runNodeStrict(script, args, opts = {}) {
  return execFileSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    ...opts,
  });
}

/**
 * Runs an `npm` subcommand. npm ships as `npm.cmd` on Windows, which needs a
 * shell; `shell: true` is safe here because no argument is attacker-controlled
 * and paths are quoted below.
 */
export function runNpm(args, opts = {}) {
  const quoted = IS_WINDOWS ? args.map((a) => (/\s/.test(a) ? `"${a}"` : a)) : args;
  return execFileSync(IS_WINDOWS ? "npm.cmd" : "npm", quoted, {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    shell: IS_WINDOWS,
    ...opts,
  });
}

/** `npm` writes script output to stdout before `--json`; slice from the payload. */
export function parseNpmJson(stdout) {
  const start = stdout.search(/[[{]/);
  if (start === -1) throw new Error(`no JSON in npm output:\n${stdout}`);
  return JSON.parse(stdout.slice(start));
}

/**
 * A `file://` URL for `p`.
 *
 * Absolute paths are ambiguous as ESM specifiers on Windows — `D:\…` parses as
 * a URL with protocol `d:` — so anything handed to `import()`, or to a tool
 * that forwards it there (oxlint's `jsPlugins`), must be a URL.
 */
export function fileUrl(p) {
  return pathToFileURL(p).href;
}
