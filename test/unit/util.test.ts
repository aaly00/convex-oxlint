import { describe, expect, it } from "vitest";
import path from "node:path";
import { CONVEX_REGISTRARS, docsUrl, isEntryPoint } from "../../src/util.js";

const sep = path.sep;

describe("CONVEX_REGISTRARS", () => {
  it("matches the ESLint plugin's list exactly, in order", () => {
    expect(CONVEX_REGISTRARS).toEqual([
      "query",
      "mutation",
      "action",
      "internalQuery",
      "internalMutation",
      "internalAction",
    ]);
  });
});

describe("isEntryPoint", () => {
  const entry = [
    "/p/convex/foo.ts",
    "/p/convex/foo.tsx",
    "/p/convex/foo.js",
    "/p/convex/foo.jsx",
    "/p/convex/foo.mjs",
    "/p/convex/foo.cjs",
    "/p/convex/foo.mts",
    "/p/convex/foo.cts",
    "/p/convex/nested/deep.ts",
    "/p/convex/not_generated_prefix.ts",
    "/p/convex/schema2.ts",
    "/p/convex/_generatedish.ts",
  ];
  for (const f of entry) {
    it(`treats ${f} as an entry point`, () => {
      expect(isEntryPoint(f)).toBe(true);
    });
  }

  const notEntry = [
    ["/p/convex/foo.txt", "unsupported extension"],
    ["/p/convex/no_extension", "no extension"],
    [`/p/convex/_generated${sep}server.ts`, "inside _generated"],
    [`/p/convex/_generated${sep}nested${sep}deep.ts`, "nested inside _generated"],
    ["/p/convex/.hidden.ts", "dotfile"],
    ["/p/convex/#hash.ts", "leading #"],
    ["/p/convex/schema.ts", "schema.ts"],
    ["/p/convex/schema.js", "schema.js"],
    ["/p/convex/types.d.ts", "two dots"],
    ["/p/convex/a.b.c.ts", "many dots"],
    ["/p/con vex/foo.ts", "space in path"],
    ["/p/convex/with space.ts", "space in filename"],
    ["/p/convex/foo.TS", "uppercase extension"],
  ];
  for (const [f, why] of notEntry) {
    it(`rejects ${f} (${why})`, () => {
      expect(isEntryPoint(f)).toBe(false);
    });
  }

  it("only treats `_generated` as generated when followed by a separator", () => {
    expect(isEntryPoint("/p/convex/_generated.ts")).toBe(true);
    expect(isEntryPoint(`/p/convex/_generated${sep}x.ts`)).toBe(false);
  });
});

describe("docsUrl", () => {
  it("produces the same URLs as the ESLint plugin's RuleCreator", () => {
    expect(docsUrl("no-filter-in-query")).toBe(
      "https://docs.convex.dev/eslint#no-filter-in-query",
    );
  });
});
