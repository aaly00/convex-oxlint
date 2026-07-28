// An oxlint JS plugin whose only job is to serialize the AST oxlint hands to plugins,
// so it can be diffed against @typescript-eslint/parser's AST.
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = process.env.OXAST_OUT ?? "/tmp/oxast";

// Keys that exist on oxlint nodes but are navigation helpers rather than AST data.
const SKIP_KEYS = new Set(["parent"]);

function serialize(node) {
  if (node === null || node === undefined) return node ?? null;
  if (Array.isArray(node)) return node.map((n) => serialize(n));
  if (typeof node !== "object") {
    if (typeof node === "bigint") return { __bigint: node.toString() };
    return node;
  }
  if (node instanceof RegExp) return { __regexp: node.toString() };
  const out = {};
  // Collect own + prototype accessor keys (oxlint nodes may use getters).
  const keys = new Set();
  for (const k in node) keys.add(k);
  for (const k of Object.keys(node)) keys.add(k);
  for (const k of [...keys].sort()) {
    if (SKIP_KEYS.has(k)) continue;
    let v;
    try {
      v = node[k];
    } catch {
      continue;
    }
    if (typeof v === "function") continue;
    out[k] = serialize(v);
  }
  return out;
}

const rule = {
  meta: { messages: { m: "dumped" } },
  create(context) {
    return {
      "Program:exit"(node) {
        const rel = path
          .relative(context.cwd, context.filename)
          .replace(/[/\\]/g, "__");
        fs.mkdirSync(OUT_DIR, { recursive: true });
        fs.writeFileSync(
          path.join(OUT_DIR, `${rel}.json`),
          JSON.stringify(
            {
              ast: serialize(node),
              text: context.sourceCode.text,
              isESTree: context.sourceCode.isESTree,
              visitorKeys: context.sourceCode.visitorKeys,
            },
            null,
            2,
          ),
        );
      },
    };
  },
};

export default { meta: { name: "astdump" }, rules: { dump: rule } };
