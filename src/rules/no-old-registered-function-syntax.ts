import type { Rule } from "@oxlint/plugins";
import type {
  CallExpression,
  FunctionLike,
  Identifier,
  Node,
  VariableDeclarator,
} from "../ast.js";
import { CONVEX_REGISTRARS, docsUrl, isEntryPoint } from "../util.js";

/**
 * Check if the function has a second parameter (args parameter)
 * that would indicate it expects arguments
 */
function hasFunctionArgs(fn: FunctionLike): boolean {
  return fn.params.length >= 2;
}

/**
 * Rule to enforce using object syntax for Convex functions instead of the older function syntax
 */
export const noOldRegisteredFunctionSyntax: Rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Don't use the non-object Convex function syntax. It's harder to add validation rules.",
      url: docsUrl("no-old-registered-function-syntax"),
    },
    messages: {
      "use-object-syntax":
        "Use the object syntax for registered Convex queries, mutations, and actions.",
    },
    schema: [],
    fixable: "code",
  },
  createOnce(context) {
    return {
      before() {
        const { filename } = context;
        // Skip generated files
        const isGenerated = filename.includes("_generated");
        const entry = isEntryPoint(filename);
        // Returning `false` skips this file entirely, mirroring the ESLint
        // plugin returning an empty visitor object.
        return !(isGenerated || !entry);
      },

      // Check variable declarations for exports that use the old syntax.
      // The selector pre-filters in Rust so the JS callback only runs for
      // `<id> = <callee>(...)` declarators.
      'VariableDeclarator[init.type="CallExpression"][init.callee.type="Identifier"]'(
        node: VariableDeclarator,
      ) {
        // Only interested in export declarations
        const parentDecl = node.parent;
        if (!parentDecl) return;
        const exportDecl = parentDecl.parent;
        if (
          exportDecl?.type !== "ExportNamedDeclaration" &&
          (parentDecl.parent as Node | undefined)?.parent?.type !==
            "ExportNamedDeclaration"
        ) {
          return;
        }

        const init = node.init as CallExpression;
        // Check if it's a call to a registrar with a function argument
        if (
          CONVEX_REGISTRARS.includes(
            (init.callee as Identifier).name,
          ) &&
          init.arguments.length === 1 &&
          (init.arguments[0].type === "ArrowFunctionExpression" ||
            init.arguments[0].type === "FunctionExpression")
        ) {
          const functionArg = init.arguments[0] as FunctionLike;

          // Report the issue
          context.report({
            node: init,
            messageId: "use-object-syntax",
            fix: (fixer) => {
              // Check if the function has a second parameter (args)
              const hasArgsParam = hasFunctionArgs(functionArg);

              // Create object syntax replacement
              let fixText = "{\n";

              // We only add empty args if there's no second parameter
              // If there is a second parameter, we leave args undefined for the no-missing-args-validator
              // rule to handle it correctly later
              if (!hasArgsParam) {
                fixText += "  args: {},\n";
              }

              // Get the original function text without the outer parentheses
              const originalFunctionText =
                context.sourceCode.getText(functionArg);

              // Add the handler property with the original function
              fixText += `  handler: ${originalFunctionText}`;
              fixText += "\n}";

              return fixer.replaceText(functionArg, fixText);
            },
          });
        }
      },
    };
  },
};
