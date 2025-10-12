import jscodeshift from "jscodeshift";
import { emberParser } from "./parser.js";

export let j = jscodeshift.withParser(emberParser());

export function lines(stringArray) {
  return stringArray.join("\n");
}

export function transform(input, transformer) {
  let root = j(input);
  transformer(root);
  return root.toSource();
}

export function reverseIdentifiers(root) {
  root.find(j.Identifier).forEach((path) => {
    j(path).replaceWith(
      j.identifier(path.node.name.split("").reverse().join("")),
    );
  });
}
