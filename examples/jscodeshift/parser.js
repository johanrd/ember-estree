import { toTree } from "ember-estree";

export function emberParser(options = {}) {
  return {
    parse(code) {
      return toTree(code, {
        ...options,
      });
    },
  };
}
