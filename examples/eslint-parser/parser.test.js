import { describe, expect, it } from "vitest";
import { parseForESLint } from "./parser.js";

describe("ESLint parser example", () => {
  it("returns a Program AST with visitorKeys", () => {
    const source = `const x = <template><h1>Hello</h1></template>;`;
    const result = parseForESLint(source);

    expect(result.ast.type).toBe("Program");
    expect(result.visitorKeys).toBeDefined();
    expect(result.visitorKeys.GlimmerTemplate).toEqual(["body"]);
    expect(result.visitorKeys.GlimmerElementNode).toContain("blockParamNodes");
    expect(result.visitorKeys.GlimmerElementNode).toContain("parts");
  });

  it("produces Glimmer-prefixed node types", () => {
    const source = `const x = <template><h1>Hello</h1></template>;`;
    const result = parseForESLint(source);

    // Walk the AST to find Glimmer nodes
    const glimmerTypes = new Set();
    function walk(node, visited = new Set()) {
      if (!node || typeof node !== "object" || visited.has(node)) return;
      visited.add(node);
      if (node.type && typeof node.type === "string" && node.type.startsWith("Glimmer")) {
        glimmerTypes.add(node.type);
      }
      for (const key of Object.keys(node)) {
        if (key === "loc" || key === "parent") continue;
        const val = node[key];
        if (Array.isArray(val)) {
          for (const item of val) walk(item, visited);
        } else if (val && typeof val === "object") {
          walk(val, visited);
        }
      }
    }
    walk(result.ast);

    expect(glimmerTypes.has("GlimmerTemplate")).toBe(true);
    expect(glimmerTypes.has("GlimmerElementNode")).toBe(true);
    expect(glimmerTypes.has("GlimmerTextNode")).toBe(true);
  });

  it("has correct ranges on Glimmer nodes", () => {
    const source = `const x = <template><h1>Hello</h1></template>;`;
    const result = parseForESLint(source);

    function findNode(node, type, visited = new Set()) {
      if (!node || typeof node !== "object" || visited.has(node)) return null;
      visited.add(node);
      if (node.type === type) return node;
      for (const key of Object.keys(node)) {
        if (key === "loc" || key === "parent") continue;
        const val = node[key];
        if (Array.isArray(val)) {
          for (const item of val) {
            const found = findNode(item, type, visited);
            if (found) return found;
          }
        } else if (val && typeof val === "object") {
          const found = findNode(val, type, visited);
          if (found) return found;
        }
      }
      return null;
    }

    const template = findNode(result.ast, "GlimmerTemplate");
    expect(template).toBeTruthy();
    expect(source.slice(template.start, template.end)).toBe(
      "<template><h1>Hello</h1></template>",
    );

    const element = findNode(result.ast, "GlimmerElementNode");
    expect(element).toBeTruthy();
    expect(source.slice(element.start, element.end)).toBe("<h1>Hello</h1>");
  });

  it("handles gts with TypeScript", () => {
    const source = `
interface Args { name: string; }
export default class Greeting {
  <template><h1>Hello</h1></template>
}`;
    const result = parseForESLint(source);

    expect(result.ast.type).toBe("Program");
    expect(result.ast.body.length).toBeGreaterThan(0);

    // Should have both TS and Glimmer nodes
    const nodeTypes = new Set();
    function walk(node, visited = new Set()) {
      if (!node || typeof node !== "object" || visited.has(node)) return;
      visited.add(node);
      if (node.type) nodeTypes.add(node.type);
      for (const key of Object.keys(node)) {
        if (key === "loc" || key === "parent") continue;
        const val = node[key];
        if (Array.isArray(val)) {
          for (const item of val) walk(item, visited);
        } else if (val && typeof val === "object") {
          walk(val, visited);
        }
      }
    }
    walk(result.ast);

    expect(nodeTypes.has("TSInterfaceDeclaration")).toBe(true);
    expect(nodeTypes.has("ClassDeclaration")).toBe(true);
  });

  it("visitor keys include all Glimmer types", () => {
    const source = `const x = <template>hello</template>;`;
    const result = parseForESLint(source);
    const keys = result.visitorKeys;

    // Standard Glimmer visitor keys should be present
    expect(keys.GlimmerTemplate).toBeDefined();
    expect(keys.GlimmerElementNode).toBeDefined();
    expect(keys.GlimmerMustacheStatement).toBeDefined();
    expect(keys.GlimmerBlockStatement).toBeDefined();
    expect(keys.GlimmerPathExpression).toBeDefined();
    expect(keys.GlimmerSubExpression).toBeDefined();
    expect(keys.GlimmerAttrNode).toBeDefined();
    expect(keys.GlimmerTextNode).toBeDefined();
    expect(keys.GlimmerProgram).toEqual(["body", "blockParamNodes"]);
  });
});
