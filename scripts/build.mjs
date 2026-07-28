// Dual ESM + CommonJS build driven by TypeScript 7 (the native compiler).
//
// TypeScript 7 no longer ships the classic JS `typescript` API (`main` is
// null), so build tools that `require("typescript")` — tshy among them —
// cannot drive it. Invoking `tsc` directly avoids that entirely, and keeps
// `typescript@5` in devDependencies purely for the ESLint parity harness,
// where @typescript-eslint/parser still needs the 5.x API.
//
// Under `module: nodenext`, tsc picks the emit format from the nearest
// package.json `type` of the *source* file, so each dialect is compiled from a
// staged copy of `src/` carrying the right marker.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TSC = path.join(root, "node_modules/typescript7/bin/tsc");
const stageRoot = path.join(root, ".build");

const DIALECTS = [
  { name: "esm", type: "module", outDir: "dist/esm" },
  { name: "commonjs", type: "commonjs", outDir: "dist/commonjs" },
];

const BASE_OPTIONS = {
  target: "ES2022",
  lib: ["ES2022"],
  module: "nodenext",
  moduleResolution: "nodenext",
  strict: true,
  declaration: true,
  declarationMap: true,
  sourceMap: true,
  esModuleInterop: true,
  skipLibCheck: true,
  forceConsistentCasingInFileNames: true,
  types: ["node"],
};

fs.rmSync(path.join(root, "dist"), { recursive: true, force: true });
fs.rmSync(stageRoot, { recursive: true, force: true });

for (const dialect of DIALECTS) {
  const stage = path.join(stageRoot, dialect.name);
  fs.mkdirSync(stage, { recursive: true });
  fs.cpSync(path.join(root, "src"), path.join(stage, "src"), {
    recursive: true,
    filter: (src) => !src.endsWith(".test.ts"),
  });
  fs.writeFileSync(
    path.join(stage, "package.json"),
    JSON.stringify({ type: dialect.type }, null, 2),
  );
  fs.writeFileSync(
    path.join(stage, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          ...BASE_OPTIONS,
          rootDir: "src",
          outDir: path.join(root, dialect.outDir),
          typeRoots: [path.join(root, "node_modules/@types")],
        },
        include: ["src"],
      },
      null,
      2,
    ),
  );

  process.stdout.write(`building ${dialect.name}… `);
  execFileSync(TSC, ["-p", path.join(stage, "tsconfig.json")], {
    cwd: root,
    stdio: "inherit",
  });

  // Mark the emitted directory so Node resolves the right module format.
  fs.writeFileSync(
    path.join(root, dialect.outDir, "package.json"),
    JSON.stringify({ type: dialect.type }, null, 2) + "\n",
  );

  // Sources were compiled from a staging copy that is about to be deleted, so
  // repoint every `.map` at the `src/` directory the package actually ships.
  retargetMaps(path.join(root, dialect.outDir), dialect.name);
  console.log("ok");
}

/** Rewrites `sources` entries in .js.map / .d.ts.map from the staging dir to `src/`. */
function retargetMaps(outDir, dialectName) {
  const stageMarker = path.join(".build", dialectName, "src");
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
        continue;
      }
      if (!entry.name.endsWith(".map")) continue;
      const map = JSON.parse(fs.readFileSync(p, "utf8"));
      map.sources = (map.sources ?? []).map((s) => {
        const abs = path.resolve(path.dirname(p), s);
        const rel = path.relative(root, abs);
        const marker = rel.includes(stageMarker)
          ? path.join("src", rel.split(stageMarker)[1] ?? "")
          : rel;
        return path.relative(path.dirname(p), path.join(root, marker));
      });
      delete map.sourceRoot;
      fs.writeFileSync(p, JSON.stringify(map));
    }
  };
  walk(outDir);
}

fs.rmSync(stageRoot, { recursive: true, force: true });
