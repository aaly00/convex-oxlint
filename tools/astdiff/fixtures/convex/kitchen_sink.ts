import { query, mutation, action, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

// --- old function syntax variants -------------------------------------------
export const a = query(async (ctx) => {
  return 1;
});
export const b = query(async (ctx, args) => {
  return args;
});
export const c = mutation(function (ctx, { a }: { a: string }) {
  return a;
});
export const d = action(async (ctx, {}) => 1);
export const e = internalQuery((ctx) => 1);

// --- object syntax ----------------------------------------------------------
export const f = query({
  args: {},
  handler: async (ctx) => 1,
});
export const g = query({
  handler: async (ctx) => 1,
});
export const h = query({
  handler: async (ctx, args) => args,
});
export const i = query({
  handler: async (ctx, {}) => 1,
});
export const j = query({ returns: v.null(), handler: async (ctx, args) => 1 });
export const k = query({ ["args"]: {}, handler: async (ctx) => 1 });
export const l = query({ ...spread, handler: async (ctx) => 1 });
export const m = query({ args, handler: async (ctx) => 1 });

// --- non-exported / non-registrar -------------------------------------------
const n = query(async (ctx) => 1);
export const o = notARegistrar(async (ctx) => 1);
export const p = query(async (ctx) => 1, extraArg);
export { n as nn };

// --- filter chains ----------------------------------------------------------
export const q1 = query({
  args: {},
  handler: async (ctx) => {
    const r1 = await ctx.db
      .query("messages")
      .filter((q) => q.eq(q.field("a"), 1))
      .collect();
    const r2 = await ctx.db.query("m").withIndex("by_a").filter((q) => q).first();
    const r3 = await ctx.db.query("m").order("desc").filter((q) => q).take(5);
    const r4 = (await ctx.db.query("m").collect()).filter((x) => x);
    const r5 = [1, 2].filter((x) => x > 1);
    const db = ctx.db;
    const r6 = db.query("m").filter((q) => q);
    const r7 = (db as any).privateSystem.query("_t").filter((q) => q);
    const r8 = db.privateSystem.query("_t").filter((q) => q);
    const r9 = ctx.db.privateSystem.query("_t").filter((q) => q);
    const q = ctx.db.query("m");
    const r10 = q.filter((x) => x);
    const r11 = ctx.db.query("m")!.filter((x) => x);
    const r12 = ctx.db?.query("m")?.filter((x) => x);
    const r13 = (ctx.db.query("m") as any).filter((x) => x);
    const r14 = <any>ctx.db.query("m");
    const r15 = ctx.db.query("m").withSearchIndex("s", (q) => q).filter((q) => q);
    const r16 = ctx.db.query("m").unique();
    const r17 = ctx.db.query("m").paginate(opts);
    return [r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17];
  },
});

// --- db id calls ------------------------------------------------------------
export const q2 = mutation({
  args: { id: v.id("messages") },
  handler: async (ctx, args) => {
    await ctx.db.get(args.id);
    await ctx.db.get("messages", args.id);
    await ctx.db.patch(args.id, {});
    await ctx.db.patch("messages", args.id, {});
    await ctx.db.replace(args.id, {} as any);
    await ctx.db.delete(args.id);
    await ctx.db["get"](args.id);
    const db = ctx.db;
    await db.get(args.id);
    await other.get(args.id);
  },
});

declare const spread: Record<string, never>;
declare const args: Record<string, never>;
declare const opts: any;
declare const other: any;
declare function notARegistrar(f: unknown): unknown;
