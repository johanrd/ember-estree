import { describe, expect, it } from "vitest";
import { parse, removeParentReferences } from "../src/index.js";

describe("removeParentReferences", () => {
  it("removes parent references from all Glimmer nodes", () => {
    const ast = parse(`const x = <template><h1>Hello</h1></template>;`);

    // parent references exist before removal
    const glimmerNodes = [];
    (function collect(node, visited = new Set()) {
      if (!node || typeof node !== "object" || visited.has(node)) return;
      visited.add(node);
      if (node.type?.startsWith("Glimmer") && "parent" in node) {
        glimmerNodes.push(node);
      }
      for (const key of Object.keys(node)) {
        if (key === "parent" || key === "loc") continue;
        const val = node[key];
        if (Array.isArray(val)) val.forEach((v) => collect(v, visited));
        else if (val && typeof val === "object") collect(val, visited);
      }
    })(ast);

    expect(glimmerNodes.length).toBeGreaterThan(0);

    removeParentReferences(ast);

    for (const node of glimmerNodes) {
      expect("parent" in node).toBe(false);
    }
  });

  it("returns the same AST (mutates in place)", () => {
    const ast = parse(`const x = <template>hi</template>;`);
    const result = removeParentReferences(ast);

    expect(result.type).toBe(ast.type);
    expect(result.program).toBe(ast.program);
  });

  it("produces a JSON-serializable tree", () => {
    const ast = parse(`const x = <template><div>{{@name}}</div></template>;`);
    removeParentReferences(ast);

    expect(() => JSON.stringify(ast)).not.toThrow();
  });
});
