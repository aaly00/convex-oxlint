declare function query(...a: unknown[]): unknown;
declare const ctx: any;
// Outside the convex directory: the recommended config must not apply here.
export const outside = query(async (c) => 1);
export const outsideFilter = ctx.db.query("m").filter((q) => q);
