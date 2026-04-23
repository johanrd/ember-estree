import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { toTree, print } from "../src/index.js";

const require = createRequire(import.meta.url);

function oxcParse(js) {
  const { parseSync } = require("oxc-parser");
  const result = parseSync("test.js", js);
  return { ast: result.program };
}

describe("toTree — modify", () => {
  it("is called once with the outer AST", () => {
    let received;
    let callCount = 0;
    toTree(`const x = <template>hi</template>;`, {
      modify: (ast) => {
        received = ast;
        callCount++;
        return {};
      },
    });
    expect(callCount).toBe(1);
    // Default oxc path wraps the program in { type: "File", program }
    expect(received.type).toBe("File");
    expect(received.program).toBeDefined();
  });

  it("visitors fire on outer JS/TS nodes", () => {
    const names = [];
    toTree(`const foo = 1; const bar = 2;`, {
      modify: () => ({
        Identifier: (node) => names.push(node.name),
      }),
    });
    expect(names.sort()).toEqual(["bar", "foo"]);
  });

  it("visitors fire on Glimmer nodes inside templates", () => {
    const seen = [];
    toTree(`const X = <template>{{name}}</template>;`, {
      modify: () => ({
        GlimmerPathExpression: (node) => seen.push(node.original),
      }),
    });
    expect(seen).toContain("name");
  });

  it("mutations to JS identifiers persist in the printed output", () => {
    const ast = toTree(`const foo = 1; const bar = 2;`, {
      modify: () => ({
        Identifier: (node) => (node.name = [...node.name].reverse().join("")),
      }),
    });
    expect(print(ast.program)).toMatchInlineSnapshot(`
      "const oof = 1;
      const rab = 2;"
    `);
  });

  it("reverses identifiers across JS and Glimmer parts", () => {
    const ast = toTree(`const hello = 1; const X = <template>{{world}}</template>;`, {
      modify: () => ({
        Identifier: (node) => (node.name = [...node.name].reverse().join("")),
        GlimmerPathExpression(node) {
          const reversed = [...node.original].reverse().join("");
          node.original = reversed;
          if (node.head) node.head.name = reversed;
        },
      }),
    });
    expect(print(ast.program)).toMatchInlineSnapshot(`
      "const olleh = 1;
      const X = <template>{{dlrow}}</template>;"
    `);
  });

  it("collects comments from JS and Glimmer in one pass", () => {
    const source = `const X = <template><!-- html --> {{! short }} {{!-- long --}}</template>;`;
    const comments = [];
    toTree(source, {
      modify: () => ({
        GlimmerCommentStatement: (node) => comments.push({ kind: "html", value: node.value }),
        GlimmerMustacheCommentStatement: (node) =>
          comments.push({ kind: node.longForm ? "long" : "short", value: node.value }),
      }),
    });
    expect(comments).toEqual([
      { kind: "html", value: " html " },
      { kind: "short", value: " short " },
      { kind: "long", value: " long " },
    ]);
  });

  it("removes comments from Glimmer template body", () => {
    const ast = toTree(`const X = <template><h1>Hi</h1>{{! drop me }}<p>Bye</p></template>;`, {
      modify: () => ({
        GlimmerMustacheCommentStatement(node, path) {
          const siblings = path.parent?.body || path.parent?.children;
          const idx = siblings?.indexOf(node) ?? -1;
          if (idx >= 0) siblings.splice(idx, 1);
        },
      }),
    });
    expect(print(ast.program)).toMatchInlineSnapshot(
      `"const X = <template><h1>Hi</h1><p>Bye</p></template>;"`,
    );
  });

  it("mutating a comment value changes printed output (end-to-end)", () => {
    const ast = toTree(`const X = <template>{{!-- original --}}</template>;`, {
      modify: () => ({
        GlimmerMustacheCommentStatement: (node) => (node.value = "updated"),
      }),
    });
    expect(print(ast.program)).toMatchInlineSnapshot(
      `"const X = <template>{{!-- updated --}}</template>;"`,
    );
  });

  it("path.parent is set correctly for Glimmer nodes", () => {
    let pathParent;
    toTree(`const X = <template><div>{{name}}</div></template>;`, {
      modify: () => ({
        GlimmerPathExpression: (_node, path) => (pathParent = path.parent),
      }),
    });
    expect(pathParent?.type).toBe("GlimmerMustacheStatement");
  });

  it("works when there are no templates in the source", () => {
    const names = [];
    const ast = toTree(`const a = 1; const b = 2;`, {
      modify: () => ({
        Identifier(node) {
          names.push(node.name);
          node.name = `${node.name}_seen`;
        },
      }),
    });
    expect(names.sort()).toEqual(["a", "b"]);
    expect(print(ast.program)).toMatchInlineSnapshot(`
      "const a_seen = 1;
      const b_seen = 2;"
    `);
  });

  it("returning null or undefined from modify is a no-op", () => {
    const source = `const x = <template>hi</template>;`;
    expect(() => toTree(source, { modify: () => null })).not.toThrow();
    expect(() => toTree(source, { modify: () => undefined })).not.toThrow();
  });

  it("works with a custom parser on the JS/TS side", () => {
    const seen = [];
    const result = toTree(`const foo = 1; const X = <template>{{name}}</template>;`, {
      parser: oxcParse,
      modify: () => ({
        Identifier: (node) => seen.push(node.name),
        GlimmerPathExpression: (node) => seen.push(`glimmer:${node.original}`),
      }),
    });
    expect(seen).toContain("foo");
    expect(seen).toContain("X");
    expect(seen).toContain("glimmer:name");
    expect(result.ast).toBeDefined();
  });

  it("coexists with options.visitors — both fire on Glimmer nodes", () => {
    const fromVisitors = [];
    const fromModify = [];
    toTree(`const X = <template>{{name}}</template>;`, {
      parser: oxcParse,
      visitors: {
        GlimmerPathExpression: (node) => fromVisitors.push(node.original),
      },
      modify: () => ({
        GlimmerPathExpression: (node) => fromModify.push(node.original),
      }),
    });
    expect(fromVisitors).toEqual(["name"]);
    expect(fromModify).toEqual(["name"]);
  });
});
