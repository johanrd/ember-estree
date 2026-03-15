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

    const template = findNode(ast, "GlimmerTemplate");
    expect(template).toBeTruthy();

    const element = findNode(ast, "GlimmerElementNode");
    expect(element).toBeTruthy();

    const elements = findAllNodes(ast, "GlimmerElementNode");
    const h1 = elements.find((e) => e.tag === "h1");
    expect(h1).toBeTruthy();
    expect(h1.tag).toBe("h1");
  });

  it("parses Glimmer mustache statements", () => {
    const source = `const x = <template><div>{{@name}}</div></template>;`;
    const ast = parse(source);

    const mustache = findNode(ast, "GlimmerMustacheStatement");
    expect(mustache).toBeTruthy();
  });

  it("resolves class body templates into GlimmerTemplate nodes", () => {
    const source = `export default class MyComponent extends Component {
  <template><h1>Hello</h1></template>
}`;
    const ast = parse(source);

    const classDecl = findNode(ast, "ClassDeclaration");
    expect(classDecl).toBeTruthy();

    const template = findNode(ast, "GlimmerTemplate");
    expect(template).toBeTruthy();
    expect(template.type).toBe("GlimmerTemplate");

    // Template should be in the class body
    expect(classDecl.body.body[0]).toBe(template);

    // Template should contain the element
    const h1 = findNode(template, "GlimmerElementNode");
    expect(h1).toBeTruthy();
    expect(h1.tag).toBe("h1");
  });

  it("class body templates have correct byte offsets", () => {
    const source = `export default class MyComponent extends Component {
  <template><h1>Hello</h1></template>
}`;
    const ast = parse(source);

    const template = findNode(ast, "GlimmerTemplate");
    expect(template).toBeTruthy();

    // Byte offsets should correspond to the <template>...</template> in the source
    expect(source.substring(template.start, template.end)).toBe(
      "<template><h1>Hello</h1></template>",
    );
    expect(template.range[0]).toBe(template.start);
    expect(template.range[1]).toBe(template.end);
  });

  it("class body templates coexist with class methods", () => {
    const source = `class Greeting extends Component {
  get name() { return this.args.name; }
  <template><h1>Hello {{@name}}</h1></template>
}`;
    const ast = parse(source);

    const classDecl = findNode(ast, "ClassDeclaration");
    expect(classDecl.body.body.length).toBe(2);
    expect(classDecl.body.body[0].type).toBe("MethodDefinition");
    expect(classDecl.body.body[1].type).toBe("GlimmerTemplate");

    const mustache = findNode(ast, "GlimmerMustacheStatement");
    expect(mustache).toBeTruthy();
  });

  it("handles multiple classes with templates", () => {
    const source = `class A extends Component {
  <template><div>A</div></template>
}
class B extends Component {
  <template><div>B</div></template>
}`;
    const ast = parse(source);

    const templates = findAllNodes(ast, "GlimmerTemplate");
    expect(templates.length).toBe(2);
  });
});
