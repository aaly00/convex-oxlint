import { query } from "./_generated/server";
import type { DatabaseReader } from "./_generated/server";

export const direct = query({
  args: {},
  handler: async (ctx) => {
    // Recognised by the AST fallback: receiver is a `ctx.db.query(...)` chain.
    return await ctx.db.query("messages").filter((q) => q.eq(q.field("author"), "me")).collect();
  },
});

export const chained = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_creation_time")
      .order("desc")
      .filter((q) => q.eq(q.field("author"), "me"))
      .take(5);
  },
});

export const viaVariable = query({
  args: {},
  handler: async (ctx) => {
    // Receiver is a bare identifier: only type information can tell that `q`
    // is a Convex query builder.
    const q = ctx.db.query("messages");
    return await q.filter((f) => f.eq(f.field("author"), "me")).collect();
  },
});

export const viaRenamedReader = query({
  args: {},
  handler: async (ctx) => {
    // The AST fallback looks for a receiver literally named `db`.
    const reader: DatabaseReader = ctx.db;
    return await reader.query("messages").filter((f) => f.eq(f.field("author"), "me")).collect();
  },
});

export const viaHelper = query({
  args: {},
  handler: async (ctx) => {
    const build = () => ctx.db.query("messages");
    return await build().filter((f) => f.eq(f.field("author"), "me")).collect();
  },
});

export const arrayFilterAfterCollect = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("messages").collect();
    return rows.filter((m) => m.author === "me");
  },
});

export const plainArrayFilter = query({
  args: {},
  handler: async () => {
    return [1, 2, 3].filter((n) => n > 1);
  },
});
