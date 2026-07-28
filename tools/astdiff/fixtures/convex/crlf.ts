export const crlf = query(async (ctx) => 1);
export const two = query({ handler: async (ctx, args) => args });
declare function query(f: unknown): unknown;
