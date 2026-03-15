import { describe, expect, it } from "vitest";
import { Linter } from "eslint";
import emberEstreeParser from "./parser.js";

/**
 * These tests invoke ESLint's Linter API with our custom parser
 * to prove the parser works end-to-end — not just as a function call,
 * but as a real ESLint parser plugin that ESLint can traverse and lint.
 */

function createLinter() {
  return new Linter({ configType: "flat" });
}

function lint(source, rules = {}) {
  const linter = createLinter();
  return linter.verify(source, {
    languageOptions: {
      parser: emberEstreeParser,
    },
    rules,
  });
}

describe("ESLint parser example — invokes ESLint", () => {
  it("parses gjs without errors", () => {
    const source = `const x = <template><h1>Hello</h1></template>;`;
    const messages = lint(source);

    // No parse errors
    const parseErrors = messages.filter((m) => m.fatal);
    expect(parseErrors).toEqual([]);
  });

  it("ESLint can report lint violations on JS around templates", () => {
    const source = `var x = <template><h1>Hello</h1></template>;`;
    const messages = lint(source, { "no-var": "error" });

    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0].ruleId).toBe("no-var");
    expect(messages[0].message).toContain("Unexpected var");
  });

  it("no-unused-vars works on JS identifiers", () => {
    // 'y' is declared but never used
    const source = `
const y = 1;
const x = <template><h1>Hello</h1></template>;
export { x };`;
    const messages = lint(source, { "no-unused-vars": "error" });

    const unusedVars = messages.filter((m) => m.ruleId === "no-unused-vars");
    expect(unusedVars.length).toBeGreaterThan(0);
    expect(unusedVars[0].message).toContain("y");
  });

  it("ESLint traverses Glimmer nodes without crashing", () => {
    // A complex template with nested Glimmer nodes
    const source = `
const Greeting = <template>
  <div class="wrapper">
    <h1>{{@name}}</h1>
    <p>Welcome!</p>
  </div>
</template>;
export { Greeting };`;

    const messages = lint(source);
    const parseErrors = messages.filter((m) => m.fatal);
    expect(parseErrors).toEqual([]);
  });

  it("handles multiple templates in one file", () => {
    const source = `
const A = <template><h1>A</h1></template>;
const B = <template><h2>B</h2></template>;
export { A, B };`;

    const messages = lint(source);
    const parseErrors = messages.filter((m) => m.fatal);
    expect(parseErrors).toEqual([]);
  });

  it("handles gts-style class with template", () => {
    const source = `
export default class Greeting {
  <template><h1>Hello</h1></template>
}`;

    const messages = lint(source);
    const parseErrors = messages.filter((m) => m.fatal);
    expect(parseErrors).toEqual([]);
  });

  it("semi rule works on statements around templates", () => {
    // Missing semicolons
    const source = `const x = <template><h1>Hello</h1></template>
const y = 1
export { x, y }`;

    const messages = lint(source, { semi: ["error", "always"] });
    const semiErrors = messages.filter((m) => m.ruleId === "semi");
    expect(semiErrors.length).toBeGreaterThan(0);
  });

  it("ESLint can use a custom rule that visits Glimmer nodes", () => {
    const source = `const x = <template><h1>Hello</h1></template>;`;

    const linter = createLinter();
    const glimmerNodeTypes = [];

    // Define a custom rule plugin that collects Glimmer node types
    const plugin = {
      rules: {
        "collect-glimmer-nodes": {
          create(context) {
            // Return visitors for each Glimmer node type
            return {
              GlimmerTemplate(node) {
                glimmerNodeTypes.push(node.type);
              },
              GlimmerElementNode(node) {
                glimmerNodeTypes.push(node.type);
              },
              GlimmerTextNode(node) {
                glimmerNodeTypes.push(node.type);
              },
            };
          },
        },
      },
    };

    linter.verify(source, {
      plugins: { custom: plugin },
      languageOptions: {
        parser: emberEstreeParser,
      },
      rules: {
        "custom/collect-glimmer-nodes": "error",
      },
    });

    expect(glimmerNodeTypes).toContain("GlimmerTemplate");
    expect(glimmerNodeTypes).toContain("GlimmerElementNode");
    expect(glimmerNodeTypes).toContain("GlimmerTextNode");
  });
});
