import { it, expect } from "vitest";
import jscodeshift from "jscodeshift";

import { emberParser } from "./parser.js";

let j = jscodeshift.withParser(emberParser());

import * as transforms from "./transformations.js";

it("js works", () => {
  let root = j(`const xy = 2;`);

  transforms.reverseIdentifiers(root);

  let transformed = root.toSource();

  expect(transformed).toMatchInlineSnapshot(`"const yx = 2;"`);
});

it("<template> works", () => {
  let root = j(`const xy = 2;`);

  transforms.reverseIdentifiers(root);

  let transformed = root.toSource();

  expect(transformed).toMatchInlineSnapshot(`"const yx = 2;"`);
});
