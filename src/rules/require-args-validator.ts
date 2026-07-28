import type { Context, Fix, Fixer, Rule } from "@oxlint/plugins";
import type {
  CallExpression,
  FunctionLike,
  Identifier,
  Node,
  ObjectExpression,
  Property,
  VariableDeclarator,
} from "../ast.js";
import { CONVEX_REGISTRARS, docsUrl } from "../util.js";

/**
 * Helper function to check if an object expression has an args property
 */
function hasArgsProperty(objectExpr: ObjectExpression): boolean {
  return objectExpr.properties.some(
    (prop) =>
      prop.type === "Property" &&
      prop.key.type === "Identifier" &&
      prop.key.name === "args",
  );
}

/**
 * Helper function to check if a handler function has a non-empty second parameter (args parameter)
 */
function handlerHasArgsParameter(handler: FunctionLike): boolean {
  if (handler.params.length < 2) {
    return false;
  }
  // Ignore empty objects
  const secondParam = handler.params[1];
  if (
    secondParam.type === "ObjectPattern" &&
    secondParam.properties.length === 0
  ) {
    return false;
  }
  return true;
}

/**
 * Helper function to get the handler property from an object expression
 */
function getHandlerProperty(
  objectExpr: ObjectExpression,
): FunctionLike | null {
  const maybeHandler = objectExpr.properties.find(
    (prop) =>
      prop.type === "Property" &&
      prop.key.type === "Identifier" &&
      prop.key.name === "handler",
  ) as Property | undefined;
  if (!maybeHandler) return null;
  if (
    maybeHandler.value.type === "ArrowFunctionExpression" ||
    maybeHandler.value.type === "FunctionExpression"
  ) {
    return maybeHandler.value;
  }
  return null;
}

/**
 * Helper function to create a fix for missing args property
 */
function createArgsFix(
  context: Context,
  objectArg: ObjectExpression,
): (fixer: Fixer) => Fix | null {
  return (fixer) => {
    const objectText = context.sourceCode.getText(objectArg);
    const firstBracePos = objectText.indexOf("{");
    if (firstBracePos === -1) return null;
    const insertPos = objectArg.range[0] + firstBracePos + 1;
    return fixer.insertTextAfterRange([insertPos, insertPos], "\n  args: {},");
  };
}

/**
 * Rule to enforce that every registered Convex function has an args property
 */
export const requireArgsValidator: Rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Require argument validators (`args`) in Convex functions.",
      url: docsUrl("require-args-validator"),
    },
    messages: {
      "missing-empty-args": "Convex function is missing args validator.",
      "missing-args":
        "Convex function is missing args validator but has parameter. Add appropriate args validator.",
    },
    schema: [
      {
        type: "object",
        properties: {
          ignoreUnusedArguments: {
            type: "boolean",
            description:
              "If true, don’t require args validator when function doesn’t use args parameter",
          },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ ignoreUnusedArguments: false }],
    fixable: "code",
  },
  createOnce(context) {
    let ignoreUnusedArguments = false;

    return {
      before() {
        // Read options per file: `overrides` can configure the rule
        // differently for different globs.
        ignoreUnusedArguments =
          (context.options[0] as { ignoreUnusedArguments?: boolean })
            ?.ignoreUnusedArguments ?? false;

        // Generated files don’t define functions, so we skip them to avoid unnecessary work
        return !context.filename.includes("_generated");
      },

      'VariableDeclarator[init.type="CallExpression"][init.callee.type="Identifier"]'(
        node: VariableDeclarator,
      ) {
        const parentDecl = node.parent;
        if (!parentDecl) return;
        // In an export?
        const exportDecl = parentDecl.parent;
        if (
          exportDecl?.type !== "ExportNamedDeclaration" &&
          (parentDecl.parent as Node | undefined)?.parent?.type !==
            "ExportNamedDeclaration"
        ) {
          return;
        }

        const init = node.init as CallExpression;
        // Convex function declaration?
        if (
          !(
            CONVEX_REGISTRARS.includes(
              (init.callee as Identifier).name,
            ) && init.arguments.length === 1
          )
        )
          return;

        // Old function argument syntax?
        if (
          init.arguments[0].type === "ArrowFunctionExpression" ||
          init.arguments[0].type === "FunctionExpression"
        ) {
          const handler = init.arguments[0] as FunctionLike;
          if (handlerHasArgsParameter(handler)) {
            context.report({
              node: init,
              messageId: "missing-args",
              // Not fixable since we don’t know the type
            });
            return;
          }
          if (!ignoreUnusedArguments) {
            context.report({
              node: init,
              messageId: "missing-empty-args",
              fix: (fixer) => {
                let fixText = "{\n";
                fixText += "  args: {},\n";
                // Get the original function text without the outer parentheses
                const originalFunctionText =
                  context.sourceCode.getText(handler);
                // Add the handler property with the original function
                fixText += `  handler: ${originalFunctionText}`;
                fixText += "\n}";
                return fixer.replaceText(handler, fixText);
              },
            });
          }
          return;
        }

        // New syntax with object argument
        if (init.arguments[0].type === "ObjectExpression") {
          const objectArg = init.arguments[0];
          if (hasArgsProperty(objectArg)) {
            return;
          }

          const handlerProp = getHandlerProperty(objectArg);
          const handlerHasArgs =
            handlerProp && handlerHasArgsParameter(handlerProp);

          if (!handlerHasArgs && ignoreUnusedArguments) return;

          context.report({
            node: objectArg,
            messageId: handlerHasArgs ? "missing-args" : "missing-empty-args",
            fix: handlerHasArgs ? undefined : createArgsFix(context, objectArg),
          });
        }
      },
    };
  },
};
