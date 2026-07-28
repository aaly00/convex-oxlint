declare function query(...a: unknown[]): unknown;
declare const ctx: any;

// Not suppressed at all.
export const plain = query(async (c) => 1);

// eslint-disable-next-line @convex-dev/no-old-registered-function-syntax
export const nextLineOne = query(async (c) => 1);

// eslint-disable-next-line @convex-dev/no-old-registered-function-syntax, @convex-dev/require-args-validator
export const nextLineBoth = query(async (c) => 1);

// eslint-disable-next-line @convex-dev/no-filter-in-query
export const nextLineWrongRule = query(async (c) => 1);

export const sameLine = query(async (c) => 1); // eslint-disable-line @convex-dev/no-old-registered-function-syntax

export const sameLineAll = query(async (c) => 1); // eslint-disable-line

/* eslint-disable @convex-dev/require-args-validator */
export const inBlock = query(async (c) => 1);
export const inBlock2 = query({ handler: async (c) => 1 });
/* eslint-enable @convex-dev/require-args-validator */

export const afterEnable = query({ handler: async (c) => 1 });

// eslint-disable-next-line @convex-dev/no-filter-in-query
export const filterSuppressed = ctx.db.query("m").filter((q) => q);

export const filterReported = ctx.db.query("m").filter((q) => q); // eslint-disable-line @convex-dev/require-args-validator

/* eslint-disable-next-line @convex-dev/no-filter-in-query -- with a description */
export const filterSuppressedWithDescription = ctx.db
  .query("m")
  .filter((q) => q);
