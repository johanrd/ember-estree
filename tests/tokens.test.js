import { describe, expect, it } from "vitest";
import { toTree } from "../src/index.js";
import { parseSync } from "oxc-parser";

// Parse .hbs source and return a compact token list for snapshot assertions.
function tokens(source) {
  const result = toTree(source, { templateOnly: true, tokens: true });
  const ast = result.ast || result;
  return ast.tokens.map((t) => ({ type: t.type, value: t.value }));
}

// Parse GTS source and return the tokens on the first GlimmerTemplate node.
// The GlimmerTemplate always has its own .tokens even before the JS token
// splice, so we don't need oxc to return a token stream.
function gtsTemplateTokens(source) {
  const result = toTree(source, {
    tokens: true,
    parser(js) {
      const r = parseSync("input.gts", js);
      return { ast: r.program };
    },
  });
  const ast = result.ast?.program || result.ast || result;
  const tmpl = ast.body[0]?.declarations?.[0]?.init ?? ast.body[0];
  return tmpl.tokens.map((t) => ({ type: t.type, value: t.value }));
}

describe("token stream", () => {
  describe("mustaches", () => {
    it("simple path expression", () => {
      expect(tokens("{{name}}")).toMatchInlineSnapshot(`
        [
          {
            "type": "Punctuator",
            "value": "{",
          },
          {
            "type": "Punctuator",
            "value": "{",
          },
          {
            "type": "word",
            "value": "name",
          },
          {
            "type": "Punctuator",
            "value": "}",
          },
          {
            "type": "Punctuator",
            "value": "}",
          },
        ]
      `);
    });

    it("nested path", () => {
      expect(tokens("{{a.b.c}}")).toMatchInlineSnapshot(`
        [
          {
            "type": "Punctuator",
            "value": "{",
          },
          {
            "type": "Punctuator",
            "value": "{",
          },
          {
            "type": "word",
            "value": "a",
          },
          {
            "type": "Punctuator",
            "value": ".",
          },
          {
            "type": "word",
            "value": "b",
          },
          {
            "type": "Punctuator",
            "value": ".",
          },
          {
            "type": "word",
            "value": "c",
          },
          {
            "type": "Punctuator",
            "value": "}",
          },
          {
            "type": "Punctuator",
            "value": "}",
          },
        ]
      `);
    });
  });

  describe("elements", () => {
    it("element with text child", () => {
      expect(tokens("<p>hello</p>")).toMatchInlineSnapshot(`
        [
          {
            "type": "Punctuator",
            "value": "<",
          },
          {
            "type": "word",
            "value": "p",
          },
          {
            "type": "Punctuator",
            "value": ">",
          },
          {
            "type": "GlimmerTextNode",
            "value": "hello",
          },
          {
            "type": "Punctuator",
            "value": "<",
          },
          {
            "type": "Punctuator",
            "value": "/",
          },
          {
            "type": "word",
            "value": "p",
          },
          {
            "type": "Punctuator",
            "value": ">",
          },
        ]
      `);
    });

    it("element with string attribute", () => {
      expect(tokens('<a href="/home">link</a>')).toMatchInlineSnapshot(`
        [
          {
            "type": "Punctuator",
            "value": "<",
          },
          {
            "type": "word",
            "value": "a",
          },
          {
            "type": "word",
            "value": "href",
          },
          {
            "type": "Punctuator",
            "value": "=",
          },
          {
            "type": "GlimmerTextNode",
            "value": "/home",
          },
          {
            "type": "Punctuator",
            "value": ">",
          },
          {
            "type": "GlimmerTextNode",
            "value": "link",
          },
          {
            "type": "Punctuator",
            "value": "<",
          },
          {
            "type": "Punctuator",
            "value": "/",
          },
          {
            "type": "word",
            "value": "a",
          },
          {
            "type": "Punctuator",
            "value": ">",
          },
        ]
      `);
    });

    it("self-closing element", () => {
      expect(tokens("<br />")).toMatchInlineSnapshot(`
        [
          {
            "type": "Punctuator",
            "value": "<",
          },
          {
            "type": "word",
            "value": "br",
          },
          {
            "type": "Punctuator",
            "value": "/",
          },
          {
            "type": "Punctuator",
            "value": ">",
          },
        ]
      `);
    });
  });

  describe("block statements", () => {
    it("if block", () => {
      expect(tokens("{{#if x}}yes{{/if}}")).toMatchInlineSnapshot(`
        [
          {
            "type": "Punctuator",
            "value": "{",
          },
          {
            "type": "Punctuator",
            "value": "{",
          },
          {
            "type": "Punctuator",
            "value": "#",
          },
          {
            "type": "word",
            "value": "if",
          },
          {
            "type": "word",
            "value": "x",
          },
          {
            "type": "Punctuator",
            "value": "}",
          },
          {
            "type": "Punctuator",
            "value": "}",
          },
          {
            "type": "GlimmerTextNode",
            "value": "yes",
          },
          {
            "type": "Punctuator",
            "value": "{",
          },
          {
            "type": "Punctuator",
            "value": "{",
          },
          {
            "type": "Punctuator",
            "value": "/",
          },
          {
            "type": "word",
            "value": "if",
          },
          {
            "type": "Punctuator",
            "value": "}",
          },
          {
            "type": "Punctuator",
            "value": "}",
          },
        ]
      `);
    });

    it("block params — pipe delimiters and param names are present", () => {
      expect(tokens("{{#each items as |item i|}}<li>{{item}}</li>{{/each}}"))
        .toMatchInlineSnapshot(`
        [
          {
            "type": "Punctuator",
            "value": "{",
          },
          {
            "type": "Punctuator",
            "value": "{",
          },
          {
            "type": "Punctuator",
            "value": "#",
          },
          {
            "type": "word",
            "value": "each",
          },
          {
            "type": "word",
            "value": "items",
          },
          {
            "type": "word",
            "value": "as",
          },
          {
            "type": "Punctuator",
            "value": "|",
          },
          {
            "type": "word",
            "value": "item",
          },
          {
            "type": "word",
            "value": "i",
          },
          {
            "type": "Punctuator",
            "value": "|",
          },
          {
            "type": "Punctuator",
            "value": "}",
          },
          {
            "type": "Punctuator",
            "value": "}",
          },
          {
            "type": "Punctuator",
            "value": "<",
          },
          {
            "type": "word",
            "value": "li",
          },
          {
            "type": "Punctuator",
            "value": ">",
          },
          {
            "type": "Punctuator",
            "value": "{",
          },
          {
            "type": "Punctuator",
            "value": "{",
          },
          {
            "type": "word",
            "value": "item",
          },
          {
            "type": "Punctuator",
            "value": "}",
          },
          {
            "type": "Punctuator",
            "value": "}",
          },
          {
            "type": "Punctuator",
            "value": "<",
          },
          {
            "type": "Punctuator",
            "value": "/",
          },
          {
            "type": "word",
            "value": "li",
          },
          {
            "type": "Punctuator",
            "value": ">",
          },
          {
            "type": "Punctuator",
            "value": "{",
          },
          {
            "type": "Punctuator",
            "value": "{",
          },
          {
            "type": "Punctuator",
            "value": "/",
          },
          {
            "type": "word",
            "value": "each",
          },
          {
            "type": "Punctuator",
            "value": "}",
          },
          {
            "type": "Punctuator",
            "value": "}",
          },
        ]
      `);
    });
  });

  describe("comments", () => {
    it("mustache comment produces a single Block token", () => {
      expect(tokens("{{! a comment }}")).toMatchInlineSnapshot(`
        [
          {
            "type": "Block",
            "value": "{! a comment }}",
          },
        ]
      `);
    });

    it("html comment produces a single Block token", () => {
      expect(tokens("<!-- a comment -->")).toMatchInlineSnapshot(`
        [
          {
            "type": "Block",
            "value": "!-- a comment -->",
          },
        ]
      `);
    });

    it("comment tokens are interleaved correctly with surrounding tokens", () => {
      expect(tokens("before{{! note }}after")).toMatchInlineSnapshot(`
        [
          {
            "type": "GlimmerTextNode",
            "value": "before",
          },
          {
            "type": "Block",
            "value": "{! note }}",
          },
          {
            "type": "GlimmerTextNode",
            "value": "after",
          },
        ]
      `);
    });
  });

  describe("ordering and ranges", () => {
    it("tokens are sorted by range[0]", () => {
      const source = "<div>{{name}}</div>";
      const result = toTree(source, { templateOnly: true, tokens: true });
      const toks = (result.ast || result).tokens;
      for (let i = 1; i < toks.length; i++) {
        expect(toks[i].range[0]).toBeGreaterThanOrEqual(toks[i - 1].range[0]);
      }
    });

    it("non-comment token values match source at their range", () => {
      const source = "<div class='x'>{{name}}</div>";
      const result = toTree(source, { templateOnly: true, tokens: true });
      const toks = (result.ast || result).tokens;
      for (const t of toks) {
        if (t.type === "Block") continue; // comment tokens are offset by 1
        if (t.type === "GlimmerTextNode" && t.parent?.type === "GlimmerAttrNode") {
          // attr-value text nodes: range wraps the quotes, value is the content inside
          expect(source.slice(t.range[0] + 1, t.range[1] - 1)).toBe(t.value);
        } else {
          expect(source.slice(...t.range)).toBe(t.value);
        }
      }
    });

    it("comment Block token sits inside the comment node range", () => {
      const source = "{{! a comment }}";
      const result = toTree(source, { templateOnly: true, tokens: true });
      const ast = result.ast || result;
      const commentNode = result.comments[0]; // comments are on the result, not ast
      const tok = ast.tokens[0];
      expect(tok.type).toBe("Block");
      expect(tok.range[0]).toBeGreaterThanOrEqual(commentNode.range[0]);
      expect(tok.range[1]).toBeLessThanOrEqual(commentNode.range[1]);
    });
  });

  describe("GTS template boundary tokens", () => {
    it("GlimmerTemplate.tokens includes <template> and </template> tags", () => {
      expect(gtsTemplateTokens("const x = <template>hello</template>;")).toMatchInlineSnapshot(`
        [
          {
            "type": "Punctuator",
            "value": "<template>",
          },
          {
            "type": "GlimmerTextNode",
            "value": "hello",
          },
          {
            "type": "Punctuator",
            "value": "</template>",
          },
        ]
      `);
    });

    it("boundary tokens wrap the body tokens in order", () => {
      const toks = gtsTemplateTokens("const x = <template>{{name}}</template>;");
      expect(toks[0].value).toBe("<template>");
      expect(toks[toks.length - 1].value).toBe("</template>");
    });
  });
});
