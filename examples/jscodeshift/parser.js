import { toTree } from "ember-estree";

export default function emberParser(options = {}) {
  return {
    parse(code) {
      return toTree(code, {
        sourceType: "module",
        allowImportExportEverywhere: true,
        allowReturnOutsideFunction: true,
        startLine: 1,
        tokens: true,
        plugins: [
          "asyncGenerators",
          "decoratorAutoAccessors",
          "bigInt",
          "classPrivateMethods",
          "classPrivateProperties",
          "classProperties",
          "decorators-legacy",
          "doExpressions",
          "dynamicImport",
          "exportDefaultFrom",
          "exportExtensions",
          "exportNamespaceFrom",
          "functionBind",
          "functionSent",
          "importAttributes",
          "importMeta",
          "nullishCoalescingOperator",
          "numericSeparator",
          "objectRestSpread",
          "optionalCatchBinding",
          "optionalChaining",
          ["pipelineOperator", { proposal: "minimal" }],
          "throwExpressions",
          "typescript",
        ],
        ...options,
      });
    },
  };
}
