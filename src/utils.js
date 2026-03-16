/**
 * Optional utility functions for working with ESTree ASTs
 * produced by ember-estree.
 */

import { walk } from "zimmerframe";

/**
 * Recursively remove all `parent` references from an AST.
 * Useful when you need to serialize the tree to JSON (e.g. for zmod),
 * since parent back-references create circular structures.
 *
 * Mutates the tree in place and returns it.
 */
export function removeParentReferences(ast) {
  return walk(ast, null, {
    _(node, { next }) {
      delete node.parent;
      next();
    },
  });
}
