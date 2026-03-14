import { describe, expect, it } from "vitest";
import { parse } from "../src/index.js";
import { findNode, findAllNodes } from "./helpers.js";

describe("parse", () => {
  it("returns an AST with type File", () => {
    const source = `const x = <template><h1>Hello</h1></template>;`;
    const ast = parse(source);
    expect(ast.type).toBe("File");
  });

  it("parses plain JS without templates", () => {
    const source = `const x = 1; export default x;`;
    const ast = parse(source);
    expect(ast.type).toBe("File");
  });

  it("returns an AST with a program body", () => {
    const source = `const x = <template><h1>Hello</h1></template>;`;
    const ast = parse(source);
    expect(ast.program).toBeDefined();
    expect(ast.program.body.length).toBeGreaterThan(0);
  });

  it("ensures JS nodes have start/end properties", () => {
    const source = `const x = <template><h1>Hello</h1></template>;`;
    const ast = parse(source);

    function checkStartEnd(node, visited = new Set()) {
      if (!node || typeof node !== "object" || visited.has(node)) return;
      visited.add(node);
      // Only check JS/TS nodes (those with numeric start/end from babel)
      if (node.type && typeof node.start === "number" && typeof node.end === "number") {
        expect(node.start).toBeLessThanOrEqual(node.end);
      }
      for (const key of Object.keys(node)) {
        if (key === "loc" || key === "parent") continue;
        const val = node[key];
        if (Array.isArray(val)) {
          for (const item of val) {
            checkStartEnd(item, visited);
          }
        } else if (val && typeof val === "object" && val.type) {
          checkStartEnd(val, visited);
        }
      }
    }
    checkStartEnd(ast);
  });

  it("does not have circular parent references on Glimmer nodes", () => {
    const source = `const x = <template><h1>Hello</h1></template>;`;
    const ast = parse(source);

    function checkNoCircularParent(node, visited = new Set()) {
      if (!node || typeof node !== "object" || visited.has(node)) return;
      visited.add(node);
      if (node.type) {
        expect(!("parent" in node) || node.parent === null || typeof node.parent !== "object").toBe(
          true,
        );
      }
      for (const key of Object.keys(node)) {
        if (key === "parent" || key === "loc") continue;
        const val = node[key];
        if (Array.isArray(val)) {
          for (const item of val) {
            checkNoCircularParent(item, visited);
          }
        } else if (val && typeof val === "object" && val.type) {
          checkNoCircularParent(val, visited);
        }
      }
    }
    checkNoCircularParent(ast);
  });

  it("parses Glimmer template nodes into the AST", () => {
    const source = `const Greeting = <template><h1>Hello</h1></template>;`;
    const ast = parse(source);

    const template = findNode(ast, "Template");
    expect(template).toBeTruthy();

    const element = findNode(ast, "ElementNode");
    expect(element).toBeTruthy();

    const elements = findAllNodes(ast, "ElementNode");
    const h1 = elements.find((e) => e.tag === "h1");
    expect(h1).toBeTruthy();
    expect(h1.tag).toBe("h1");
  });

  it("parses Glimmer mustache statements", () => {
    const source = `const x = <template><div>{{@name}}</div></template>;`;
    const ast = parse(source);

    const mustache = findNode(ast, "MustacheStatement");
    expect(mustache).toBeTruthy();
  });
});
