import { describe, expect, it } from "vitest";
import { parse, print } from "../src/index.js";
import { findNode } from "./helpers.js";

describe("parse + print (.gts)", () => {
  it("parses a gts-style file with a class component", () => {
    const source = `
import Component from '@glimmer/component';
export default class MyComponent extends Component {
  <template><h1>Hello</h1></template>
}
`;
    const ast = parse(source);
    expect(ast.type).toBe("File");
    expect(ast.program.body.length).toBeGreaterThan(0);
  });

  it("parses a gts-style file with type annotations", () => {
    const source = `
import Component from '@glimmer/component';

interface Args {
  name: string;
}

export default class Greeting extends Component {
  <template><h1>Hello</h1></template>
}
`;
    const ast = parse(source);
    expect(ast.type).toBe("File");

    const iface = findNode(ast, "TSInterfaceDeclaration");
    expect(iface).toBeTruthy();

    // Class body templates are present in the AST as class properties
    const classDecl = findNode(ast, "ClassDeclaration");
    expect(classDecl).toBeTruthy();
  });

  it("can print a constructed GlimmerTemplate from gts context", () => {
    const node = {
      type: "GlimmerTemplate",
      body: [
        {
          type: "GlimmerElementNode",
          tag: "p",
          attributes: [],
          modifiers: [],
          children: [{ type: "GlimmerTextNode", chars: "Content" }],
          selfClosing: false,
        },
      ],
    };
    const printed = print(node);
    expect(printed).toContain("<template>");
    expect(printed).toContain("</template>");
    expect(printed).toContain("<p>Content</p>");
  });

  it("handles gts with typed const templates", () => {
    const source = `
const Greeting = <template>
  Hello
</template>;
`;
    const ast = parse(source);
    expect(ast.type).toBe("File");

    const template = findNode(ast, "Template");
    expect(template).toBeTruthy();
  });

  it("handles gts with enum declarations", () => {
    const source = `
enum Color { Red, Green, Blue }
const x = <template>hi</template>;
`;
    const ast = parse(source);
    expect(ast.type).toBe("File");

    const enumDecl = findNode(ast, "TSEnumDeclaration");
    expect(enumDecl).toBeTruthy();
  });

  it("handles gts with type aliases", () => {
    const source = `
type Status = 'active' | 'inactive';
const Badge = <template><span>hi</span></template>;
`;
    const ast = parse(source);
    expect(ast.type).toBe("File");

    const typeAlias = findNode(ast, "TSTypeAliasDeclaration");
    expect(typeAlias).toBeTruthy();
  });

  it("prints TypeScript nodes correctly", () => {
    expect(print({ type: "TSStringKeyword" })).toBe("string");

    const interfaceNode = {
      type: "TSInterfaceDeclaration",
      id: { type: "Identifier", name: "Args" },
      body: {
        type: "TSInterfaceBody",
        body: [
          {
            type: "TSPropertySignature",
            key: { type: "Identifier", name: "name" },
            typeAnnotation: {
              type: "TSTypeAnnotation",
              typeAnnotation: { type: "TSStringKeyword" },
            },
          },
        ],
      },
    };
    const printed = print(interfaceNode);
    expect(printed).toContain("interface Args");
    expect(printed).toContain("name: string;");
  });

  it("prints enum nodes correctly", () => {
    const enumNode = {
      type: "TSEnumDeclaration",
      id: { type: "Identifier", name: "Color" },
      members: [
        { type: "TSEnumMember", id: { type: "Identifier", name: "Red" } },
        {
          type: "TSEnumMember",
          id: { type: "Identifier", name: "Blue" },
          initializer: { type: "Literal", value: 1, raw: "1" },
        },
      ],
    };
    const printed = print(enumNode);
    expect(printed).toContain("enum Color");
    expect(printed).toContain("Red");
    expect(printed).toContain("Blue = 1");
  });
});
