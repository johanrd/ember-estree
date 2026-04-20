import { describe, expect, it } from "vitest";
import { walk } from "zimmerframe";
import { toTree, print } from "../src/index.js";

describe("Glimmer comment nodes — parse + mutate + print", () => {
  it("HTML comments (<!-- -->) appear in GlimmerTemplate.body as GlimmerCommentStatement", () => {
    const ast = toTree(`const X = <template><!-- a comment --></template>;`, {
      includeParentLinks: false,
    });

    const comments = [];
    walk(ast, null, { GlimmerCommentStatement(node) { comments.push(node); } }, ast.visitorKeys);

    expect(comments.length).toBe(1);
    expect(comments[0].value).toBe(" a comment ");
  });

  it("short mustache comments ({{! }}) appear as GlimmerMustacheCommentStatement", () => {
    const ast = toTree(`const X = <template>{{! a comment }}</template>;`, {
      includeParentLinks: false,
    });

    const comments = [];
    walk(ast, null, { GlimmerMustacheCommentStatement(node) { comments.push(node); } }, ast.visitorKeys);

    expect(comments.length).toBe(1);
    expect(comments[0].value).toBe(" a comment ");
  });

  it("long mustache comments ({{!-- --}}) appear as GlimmerMustacheCommentStatement", () => {
    const ast = toTree(`const X = <template>{{!-- a comment --}}</template>;`, {
      includeParentLinks: false,
    });

    const comments = [];
    walk(ast, null, { GlimmerMustacheCommentStatement(node) { comments.push(node); } }, ast.visitorKeys);

    expect(comments.length).toBe(1);
    expect(comments[0].value).toBe(" a comment ");
  });

  it("mutating an HTML comment value via zimmerframe changes print output", () => {
    const ast = toTree(`const X = <template><!-- old content --><div>hi</div></template>;`, {
      includeParentLinks: false,
    });

    let tpl;
    walk(ast, null, {
      GlimmerTemplate(node, { next }) { tpl = node; next(); },
      GlimmerCommentStatement(node) { node.value = " new content "; },
    }, ast.visitorKeys);

    const output = print(tpl);
    expect(output).toContain("<!-- new content -->");
    expect(output).not.toContain("<!-- old content -->");
  });

  it("mutating a short mustache comment value via zimmerframe changes print output", () => {
    const ast = toTree(`const X = <template>{{! old content }}</template>;`, {
      includeParentLinks: false,
    });

    let tpl;
    walk(ast, null, {
      GlimmerTemplate(node, { next }) { tpl = node; next(); },
      GlimmerMustacheCommentStatement(node) { node.value = "new content"; },
    }, ast.visitorKeys);

    const output = print(tpl);
    expect(output).toContain("new content");
    expect(output).not.toContain("old content");
  });

  it("mutating a long mustache comment value via zimmerframe changes print output", () => {
    const ast = toTree(`const X = <template>{{!-- old content --}}</template>;`, {
      includeParentLinks: false,
    });

    let tpl;
    walk(ast, null, {
      GlimmerTemplate(node, { next }) { tpl = node; next(); },
      GlimmerMustacheCommentStatement(node) { node.value = "new content"; },
    }, ast.visitorKeys);

    const output = print(tpl);
    expect(output).toContain("new content");
    expect(output).not.toContain("old content");
  });

  it("mutates all three comment types in one walk", () => {
    const ast = toTree(
      `const X = <template><!-- html -->{{! short }}{{!-- long --}}<div>content</div></template>;`,
      { includeParentLinks: false },
    );

    let tpl;
    walk(ast, null, {
      GlimmerTemplate(node, { next }) { tpl = node; next(); },
      GlimmerCommentStatement(node) { node.value = " updated html "; },
      GlimmerMustacheCommentStatement(node) { node.value = " updated mustache "; },
    }, ast.visitorKeys);

    const output = print(tpl);
    expect(output).toContain("<!-- updated html -->");
    expect(output).not.toContain("<!-- html -->");
    expect(output).not.toContain("{{! short }}");
    expect(output).not.toContain("{{!-- long --}}");
    expect(output).toContain("<div>content</div>");
  });

  it("comment nodes carry correct start/end positions matching source", () => {
    const source = `const X = <template><!-- my comment --></template>;`;
    const ast = toTree(source, { includeParentLinks: false });

    let comment;
    walk(ast, null, { GlimmerCommentStatement(node) { comment = node; } }, ast.visitorKeys);

    expect(source.slice(comment.start, comment.end)).toBe("<!-- my comment -->");
  });
});
