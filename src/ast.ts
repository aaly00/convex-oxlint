import type { ESTree } from "@oxlint/plugins";

/**
 * Oxlint emits a standard ESTree AST at runtime (`node.type` is `"Identifier"`,
 * `"Property"`, `"FunctionExpression"`, …) but names the *TypeScript* interfaces
 * after oxc's internal AST (`IdentifierReference`, `ObjectProperty`,
 * `Function`, …). These aliases restore the ESTree names the ported rules use,
 * so the ported code stays a line-for-line match with the ESLint plugin.
 */
export type Expression = ESTree.Expression;
export type Node = ESTree.Node;
export type Identifier = ESTree.IdentifierName | ESTree.IdentifierReference;
export type Property = ESTree.ObjectProperty;
export type ObjectExpression = ESTree.ObjectExpression;
export type MemberExpression = ESTree.MemberExpression;
export type CallExpression = ESTree.CallExpression;
export type VariableDeclarator = ESTree.VariableDeclarator;
export type ImportDeclaration = ESTree.ImportDeclaration;

/**
 * An `ArrowFunctionExpression` or a `FunctionExpression`.
 *
 * `ESTree.Function` also covers `FunctionDeclaration` and the TS-only declare
 * forms, but the two are structurally identical in every field these rules
 * read (`params`, `range`), so the union is kept wide rather than narrowed
 * with a cast at each use site.
 */
export type FunctionLike = ESTree.ArrowFunctionExpression | ESTree.Function;
