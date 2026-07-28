// Emits the `.oxlintrc.json`-extendable presets from the single source of truth
// in src/configs.ts, so JSON and TS config users always get the same rules.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// `import()` takes a URL, not a path: on Windows an absolute path like `D:\…`
// is read as a URL with protocol `d:` and throws ERR_UNSUPPORTED_ESM_URL_SCHEME.
const { recommended, recommendedOxlintOnly } = await import(
  pathToFileURL(path.join(root, "dist/esm/configs.js")).href
);

const write = (file, config) =>
  fs.writeFileSync(
    path.join(root, file),
    JSON.stringify(config, null, 2) + "\n",
  );

write("oxlintrc.recommended.json", recommended);
write("oxlintrc.recommended-oxlint-only.json", recommendedOxlintOnly);
console.log("wrote oxlintrc presets");
