import { toTree, print } from "ember-estree";

/**
 * A zmod `Parser` adapter for ember-estree.
 *
 * Parses .gjs/.gts source into an ESTree-compatible AST with
 * embedded Glimmer template nodes, ensuring all nodes have
 * `start`/`end` byte offsets for zmod's span-based patching.
 *
 * @example
 * ```js
 * import { z } from "zmod";
 * import { emberParser } from "./parser.js";
 *
 * const j = z.withParser(emberParser);
 * const root = j(gjsSource);
 *
 * root.find("GlimmerElementNode", { tag: "OldComponent" })
 *     .replaceWith("<NewComponent />");
 *
 * console.log(root.toSource());
 * ```
 */
export const emberParser = {
  parse(code) {
    return toTree(code);
  },
  print(node) {
    return print(node);
  },
};
