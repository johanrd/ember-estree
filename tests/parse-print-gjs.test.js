import { describe, expect, it } from "vitest";
import { parse, print } from "../src/index.js";
import { findAllNodes } from "./helpers.js";

describe("parse + print (.gjs)", () => {
  it("round-trips a simple gjs template", () => {
    const source = `const Greeting = <template><h1>Hello</h1></template>;`;
    const ast = parse(source);
    expect(ast.type).toBe("File");
    expect(ast.program.body.length).toBeGreaterThan(0);
  });

  it("parses and identifies Glimmer nodes in gjs", () => {
    const source = `const x = <template><div class="main">content</div></template>;`;
    const ast = parse(source);

    const templates = findAllNodes(ast, "GlimmerTemplate");
    expect(templates.length).toBeGreaterThan(0);

    const elements = findAllNodes(ast, "GlimmerElementNode");
    const div = elements.find((e) => e.tag === "div");
    expect(div).toBeTruthy();
  });

  it("can print a GlimmerTemplate node", () => {
    const node = {
      type: "GlimmerTemplate",
      body: [
        {
          type: "GlimmerElementNode",
          tag: "br",
          attributes: [],
          modifiers: [],
          children: [],
          selfClosing: true,
        },
      ],
    };
    const printed = print(node);
    expect(printed).toContain("<template>");
    expect(printed).toContain("</template>");
    expect(printed).toContain("<br />");
  });

  it("handles multiple templates in a single gjs file", () => {
    const source = `
const A = <template><h1>A</h1></template>;
const B = <template><h2>B</h2></template>;
`;
    const ast = parse(source);

    const templates = findAllNodes(ast, "GlimmerTemplate");
    expect(templates.length).toBe(2);
  });

  it("handles gjs with imports", () => {
    const source = `
import { helper } from 'my-addon';
const Comp = <template>Hello</template>;
`;
    const ast = parse(source);
    expect(ast.type).toBe("File");
    expect(ast.program.body.length).toBeGreaterThan(1);
  });

  it("finds text content inside templates", () => {
    const source = `const x = <template>Hello world</template>;`;
    const ast = parse(source);

    const textNodes = findAllNodes(ast, "GlimmerTextNode");
    const hello = textNodes.find((t) => t.chars && t.chars.includes("Hello"));
    expect(hello).toBeTruthy();
  });

  it("finds element attributes in parsed templates", () => {
    const source = `const x = <template><div class="main"></div></template>;`;
    const ast = parse(source);

    const attrNodes = findAllNodes(ast, "GlimmerAttrNode");
    expect(attrNodes.length).toBeGreaterThan(0);
    expect(attrNodes[0].name).toBe("class");
  });

  it("handles Unicode in import path", () => {
    const source = `import { helper } from 'ünïcödé-addon';
const Comp = <template>Hello</template>;`;
    const ast = parse(source);

    expect(ast.type).toBe("File");
    const importDecl = ast.program.body[0];
    expect(importDecl.type).toBe("ImportDeclaration");
    expect(importDecl.source.value).toBe("ünïcödé-addon");
  });

  it("handles Unicode in template tag body", () => {
    const source = `const Greeting = <template>こんにちは</template>;`;
    const ast = parse(source);

    expect(ast.type).toBe("File");
    const textNodes = findAllNodes(ast, "GlimmerTextNode");
    const unicodeText = textNodes.find((t) => t.chars === "こんにちは");
    expect(unicodeText).toBeTruthy();
    expect(unicodeText.chars).toBe("こんにちは");
  });

  it("handles Unicode in a string literal", () => {
    const source = `const msg = '你好世界';
const Comp = <template>Hello</template>;`;
    const ast = parse(source);

    expect(ast.type).toBe("File");
    const msgDecl = ast.program.body[0];
    expect(msgDecl.type).toBe("VariableDeclaration");
    expect(msgDecl.declarations[0].init.value).toBe("你好世界");
  });

  it("handles Unicode in import path, template body, and string all together", () => {
    const source = `import { t } from '🌍-i18n';
const greeting = '¡Héllo Wörld!';
const Comp = <template>مرحبا بالعالم</template>;`;
    const ast = parse(source);

    expect(ast.type).toBe("File");

    const importDecl = ast.program.body[0];
    expect(importDecl.type).toBe("ImportDeclaration");
    expect(importDecl.source.value).toBe("🌍-i18n");

    const varDecl = ast.program.body[1];
    expect(varDecl.type).toBe("VariableDeclaration");
    expect(varDecl.declarations[0].init.value).toBe("¡Héllo Wörld!");

    const textNodes = findAllNodes(ast, "GlimmerTextNode");
    const arabicText = textNodes.find((t) => t.chars === "مرحبا بالعالم");
    expect(arabicText).toBeTruthy();
    expect(arabicText.chars).toBe("مرحبا بالعالم");
  });
});
