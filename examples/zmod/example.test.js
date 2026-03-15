import { it, expect } from "vitest";
import { toTree, print } from "ember-estree";

it("parse produces an AST", () => {
  let ast = toTree(`const xy = 2;`);

  expect(ast.type).toBe("File");
  expect(ast.program.body.length).toBeGreaterThan(0);
});

it("parse works with <template>", () => {
  let ast = toTree(`const xy = <template>hi there</template>;`);

  expect(ast.type).toBe("File");
  expect(ast.program.body.length).toBeGreaterThan(0);
});

it("print handles Glimmer nodes", () => {
  let result = print({
    type: "GlimmerTemplate",
    body: [{ type: "GlimmerTextNode", chars: "Hello" }],
  });

  expect(result).toBe("<template>Hello</template>");
});

it("print handles ESTree nodes", () => {
  let result = print({
    type: "Identifier",
    name: "foo",
  });

  expect(result).toBe("foo");
});
