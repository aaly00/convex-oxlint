import fs from "node:fs";
import path from "node:path";
import type { Rule } from "@oxlint/plugins";
import type { ImportDeclaration } from "../ast.js";
import { docsUrl, isEntryPoint } from "../util.js";

// Implement basic module resolution for relative paths only.
// This doesn't work with path aliases and so many other cases;
// it's a proof of concept that might be helpful to folks debugging.
function resolveFile(filePath: string): string | null {
  const extensions = [".ts", ".tsx", ".js", ".jsx", ""];
  for (const ext of extensions) {
    const fullPath = `${filePath}${ext}`;
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      return fullPath;
    }
  }

  // Check for directory import
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    for (const ext of extensions) {
      const indexPath = path.join(filePath, `index${ext}`);
      if (fs.existsSync(indexPath) && fs.statSync(indexPath).isFile()) {
        return indexPath;
      }
    }
  }
  return null;
}

export const noImportUseNode: Rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        'Only "use node" modules can import other "use node" modules',
      url: docsUrl("no-import-use-node"),
    },
    messages: {
      "wrong runtime import":
        'This file uses the Convex JavaScript runtime but it imports a "use node" module.',
    },
    schema: [],
  },
  createOnce(context) {
    let currentDir = "";
    // Memoizes `resolveFile` + `readFileSync` results *within a single file*.
    // Scoping the cache to one file keeps behavior identical to the ESLint
    // plugin even in long-lived processes (e.g. an editor language server)
    // where files change between lint passes.
    let useNodeCache: Map<string, boolean> | null = null;

    return {
      before() {
        const { filename } = context;
        const entry = isEntryPoint(filename);
        if (!entry) return false;
        currentDir = path.dirname(filename);
        useNodeCache = new Map();
        return true;
      },

      after() {
        useNodeCache = null;
      },

      ImportDeclaration(node: ImportDeclaration) {
        if (typeof node.source.value !== "string") return;
        const relative = node.source.value;
        if (!relative.startsWith(".")) return;
        const abs = path.resolve(currentDir, relative);
        // TODO this is a heuristic, find out about convex.json
        if (!abs.includes("convex/")) return;

        const cache = useNodeCache!;
        let isUseNode = cache.get(abs);
        if (isUseNode === undefined) {
          isUseNode = false;
          const sourceFile = resolveFile(abs);
          if (sourceFile) {
            let source: string | undefined;
            try {
              source = fs.readFileSync(sourceFile, { encoding: "utf-8" });
            } catch {
              source = undefined;
            }
            if (source && source.slice(0, 100).includes("use node")) {
              isUseNode = true;
            }
          }
          cache.set(abs, isUseNode);
        }

        if (isUseNode) {
          context.report({
            messageId: "wrong runtime import",
            node: node,
          });
        }
      },
    };
  },
};
