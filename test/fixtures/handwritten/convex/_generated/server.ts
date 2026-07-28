declare function query(...a: unknown[]): unknown;
declare const ctx: any;
// Generated files must never be reported on by any rule.
export const generatedOld = query(async (c) => 1);
export const generatedObj = query({ handler: async (c, args) => args });
export const generatedFilter = ctx.db.query("m").filter((q) => q);
