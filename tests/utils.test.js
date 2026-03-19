import { describe, expect, it } from "vitest";
import { parse } from "../src/index.js";

describe("includeParentLinks option", () => {
  it("includeParentLinks: false removes parent references from all Glimmer nodes", () => {
    const ast = parse(`const x = <template><h1>Hello</h1></template>;`, {
      includeParentLinks: false,
    });

    const glimmerNodes = [];
    (function collect(node, visited = new Set()) {
      if (!node || typeof node !== "object" || visited.has(node)) return;
      visited.add(node);
      if (node.type?.startsWith("Glimmer")) {
        glimmerNodes.push(node);
        expect("parent" in node).toBe(false);
      }
      for (const key of Object.keys(node)) {
        if (key === "parent" || key === "loc") continue;
        const val = node[key];
        if (Array.isArray(val)) val.forEach((v) => collect(v, visited));
        else if (val && typeof val === "object") collect(val, visited);
      }
    })(ast);

    expect(glimmerNodes.length).toBeGreaterThan(0);
  });

  it("produces a JSON-serializable tree", () => {
    const ast = parse(`const x = <template><div>{{@name}}</div></template>;`, {
      includeParentLinks: false,
    });

    expect(() => JSON.stringify(ast)).not.toThrow();
  });

  it("defaults to true (parent references present)", () => {
    const ast = parse(`const x = <template><h1>Hello</h1></template>;`);

    let hasParent = false;
    (function collect(node, visited = new Set()) {
      if (!node || typeof node !== "object" || visited.has(node)) return;
      visited.add(node);
      if (node.type?.startsWith("Glimmer") && "parent" in node) hasParent = true;
      for (const key of Object.keys(node)) {
        if (key === "parent" || key === "loc") continue;
        const val = node[key];
        if (Array.isArray(val)) val.forEach((v) => collect(v, visited));
        else if (val && typeof val === "object") collect(val, visited);
      }
    })(ast);

    expect(hasParent).toBe(true);
  });
});
