// Guards against publishing a package whose `src/version.ts` drifted from package.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const src = fs.readFileSync(path.join(root, "src/version.ts"), "utf8");
const match = src.match(/export const version = "([^"]+)";/);
if (!match) {
  console.error("src/version.ts does not export a version string");
  process.exit(1);
}
if (match[1] !== pkg.version) {
  console.error(
    `Version mismatch: package.json is ${pkg.version} but src/version.ts is ${match[1]}`,
  );
  process.exit(1);
}
console.log(`version-check ok (${pkg.version})`);
