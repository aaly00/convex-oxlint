declare function query(...a: unknown[]): unknown;
declare function mutation(...a: unknown[]): unknown;
declare const ctx: any;
declare const v: any;

export const list = query({
  args: {},
  handler: async (c) => c.db.query("messages").collect(),
});

export const listBad = query(async (c) => c.db.query("messages").collect());

export const send = mutation({
  handler: async (c, args) => {
    return c.db.query("messages").filter((q) => q.eq(q.field("a"), 1)).first();
  },
});

export const patched = mutation({
  args: { id: v.id("messages") },
  handler: async (c, args) => {
    await c.db.patch(args.id, {});
    await c.db.get(args.id);
    await c.db.delete(args.id);
  },
});
