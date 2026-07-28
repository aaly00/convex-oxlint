/* leading block comment */
// line comment
export declare const dq: unknown;
namespace NS {
  export const inNs = query(async (ctx) => 1);
}
declare module "m" {
  export const inMod = query(async (ctx) => 1);
}
export default query(async (ctx) => 1);
export const withSat = query(async (ctx) => 1) satisfies unknown;
export const tpl = query(async (ctx) => `x${1}y`);
enum E { A = 1, B }
class C {
  #p = 1;
  static s = query(async (ctx) => 1);
  accessor acc = 1;
  constructor(private readonly x: number) {}
  m<T extends object = {}>(a?: T, ...rest: T[]): T | undefined { return a; }
}
const { destructured = 1, ...restObj } = {} as any;
const [arr1, , arr3 = 2] = [] as any;
label: for (const x of []) { break label; }
try {} catch {} finally {}
function* gen() { yield* []; }
async function* agen() { for await (const x of []) {} }
const re = /ab+c/giu;
const big = 123n;
const opt = a?.b?.["c"]?.(1);
const nn = a!.b!;
const asrt = <const>[1, 2];
const tpl2 = tag`a${1}b`;
type T1 = { [K in keyof any]: any };
interface I1 extends Record<string, unknown> { readonly a?: string }
abstract class D { abstract m(): void }
export * from "./x";
export * as ns from "./y";
import type { A } from "./z";
import def, { named as alias } from "./w";
import * as star from "./v";
declare const a: any;
declare function tag(s: TemplateStringsArray, ...v: unknown[]): string;
declare function query(f: unknown): unknown;
