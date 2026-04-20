import { describe, expect, it } from "vitest";
import { walk } from "zimmerframe";
import { toTree, print } from "../src/index.js";

describe("Glimmer comment nodes — parse + mutate + print", () => {
  it("HTML comments (<!-- -->) appear in GlimmerTemplate.body as GlimmerCommentStatement", () => {
    const ast = toTree(`const X = <template><!-- a comment --></template>;`, {
      includeParentLinks: false,
    });

    const comments = [];
    walk(ast, null, { GlimmerCommentStatement(node) { comments.push(node); } });

    expect(comments.length).toBe(1);
    expect(comments[0].value).toBe(" a comment ");
  });

  it("short mustache comments ({{! }}) appear as GlimmerMustacheCommentStatement", () => {
    const ast = toTree(`const X = <template>{{! a comment }}</template>;`, {
      includeParentLinks: false,
    });

    const comments = [];
    walk(ast, null, { GlimmerMustacheCommentStatement(node) { comments.push(node); } });

    expect(comments.length).toBe(1);
    expect(comments[0].value).toBe(" a comment ");
  });

  it("long mustache comments ({{!-- --}}) appear as GlimmerMustacheCommentStatement", () => {
    const ast = toTree(`const X = <template>{{!-- a comment --}}</template>;`, {
      includeParentLinks: false,
    });

    const comments = [];
    walk(ast, null, { GlimmerMustacheCommentStatement(node) { comments.push(node); } });

    expect(comments.length).toBe(1);
    expect(comments[0].value).toBe(" a comment ");
  });

  it("mutating an HTML comment value via zimmerframe changes print output", () => {
    const ast = toTree(`const X = <template><!-- old content --></template>;`, {
      includeParentLinks: false,
    });

    let comment;
    walk(ast, null, { GlimmerCommentStatement(node) { node.value = " new content "; comment = node; } });

    expect(print(comment)).toBe("<!-- new content -->");
  });

  it("mutating a short mustache comment value via zimmerframe changes print output", () => {
    const ast = toTree(`const X = <template>{{! old content }}</template>;`, {
      includeParentLinks: false,
    });

    let comment;
    walk(ast, null, { GlimmerMustacheCommentStatement(node) { node.value = "new content"; comment = node; } });

    expect(print(comment)).toBe("{{! new content }}");
  });

  it("mutating a long mustache comment value via zimmerframe changes print output", () => {
    const ast = toTree(`const X = <template>{{!-- old content --}}</template>;`, {
      includeParentLinks: false,
    });

    let comment;
    walk(ast, null, { GlimmerMustacheCommentStatement(node) { node.value = "new content"; comment = node; } });

    expect(print(comment)).toBe("{{! new content }}");
  });

  it("mutates all three comment types in one walk", () => {
    const ast = toTree(
      `const X = <template><!-- html -->{{! short }}{{!-- long --}}</template>;`,
      { includeParentLinks: false },
    );

    const htmlComments = [];
    const mustacheComments = [];
    walk(ast, null, {
      GlimmerCommentStatement(node) { node.value = " updated html "; htmlComments.push(node); },
      GlimmerMustacheCommentStatement(node) { node.value = "updated mustache"; mustacheComments.push(node); },
    });

    expect(print(htmlComments[0])).toBe("<!-- updated html -->");
    expect(mustacheComments.length).toBe(2);
    expect(print(mustacheComments[0])).toBe("{{! updated mustache }}");
    expect(print(mustacheComments[1])).toBe("{{! updated mustache }}");
  });

  it("comment nodes carry correct start/end positions matching source", () => {
    const source = `const X = <template><!-- my comment --></template>;`;
    const ast = toTree(source, { includeParentLinks: false });

    let comment;
    walk(ast, null, { GlimmerCommentStatement(node) { comment = node; } });

    expect(source.slice(comment.start, comment.end)).toBe("<!-- my comment -->");
  });
});
