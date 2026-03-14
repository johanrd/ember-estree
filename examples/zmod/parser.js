import { toTree, print } from "ember-estree";

/**
 * A parser adapter for zmod that uses ember-estree
 * to parse .gjs/.gts files.
 */
export const emberParser = {
  parse(code) {
    return toTree(code);
  },
  print(node) {
    return print(node);
  },
};
