import { describe, expect, it } from "vitest";
import { parse } from "../src/index.js";

describe("parse", () => {
  it("returns an AST with type Program", () => {
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
});
