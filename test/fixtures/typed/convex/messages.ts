import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("messages").collect();
  },
});

export const listFiltered = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("messages")
      .filter((q) => q.eq(q.field("author"), "me"))
      .collect();
  },
});

export const byId = query({
  args: { id: v.id("messages") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const patchIt = mutation({
  args: { id: v.id("messages") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { body: "x" });
    await ctx.db.replace(args.id, { body: "x", author: "y" });
    await ctx.db.delete(args.id);
  },
});

export const rawId = mutation({
  args: {},
  handler: async (ctx) => {
    const id = "abc" as Id<"users">;
    await ctx.db.get(id);
  },
});

export const arrayFilterIsFine = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("messages").collect();
    return all.filter((m) => m.author === "me");
  },
});
