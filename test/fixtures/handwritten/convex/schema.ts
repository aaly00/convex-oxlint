declare function query(...a: unknown[]): unknown;
// schema.ts is not an entry point.
export const notEntry = query(async (c) => 1);
