import { describe, expect, it } from "vitest";
import { parse } from "../src/index.js";

/**
 * Recursively strip `loc`, `start`, `end`, `range`, `parent`, and `errors` from an AST
 * to make snapshots more readable.
 */
function stripPositions(node, visited = new Set()) {
  if (!node || typeof node !== "object" || visited.has(node)) return node;
  visited.add(node);

  if (Array.isArray(node)) {
    return node.map((item) => stripPositions(item, visited));
  }

  const result = {};
  for (const [key, val] of Object.entries(node)) {
    if (
      [
        "loc",
        "start",
        "end",
        "range",
        "parent",
        "errors",
        "leadingComments",
        "trailingComments",
        "innerComments",
      ].includes(key)
    )
      continue;
    if (val && typeof val === "object") {
      result[key] = stripPositions(val, visited);
    } else {
      result[key] = val;
    }
  }
  return result;
}

describe("AST snapshots — individual Glimmer nodes", () => {
  it("GlimmerTemplate root", () => {
    const ast = parse(`const x = <template>hello</template>;`);
    const program = ast.program;
    const decl = program.body[0];
    const template = decl.declarations[0].init;

    expect(template.type).toBe("GlimmerTemplate");
    expect(stripPositions(template)).toMatchInlineSnapshot(`
      {
        "blockParamNodes": [],
        "blockParams": [],
        "body": [
          {
            "chars": "hello",
            "type": "GlimmerTextNode",
            "value": "hello",
          },
        ],
        "contents": "hello",
        "tokens": [
          {
            "type": "Punctuator",
            "value": "<template>",
          },
          {
            "chars": "hello",
            "end": 25,
            "loc": {
              "end": {
                "column": 25,
                "line": 1,
              },
              "start": {
                "column": 20,
                "line": 1,
              },
            },
            "parent": {
              "blockParamNodes": [],
              "blockParams": [],
              "body": [
                [Circular],
              ],
              "contents": "hello",
              "end": 36,
              "loc": {
                "end": {
                  "column": 36,
                  "line": 1,
                },
                "start": {
                  "column": 10,
                  "line": 1,
                },
              },
              "parent": null,
              "range": [
                10,
                36,
              ],
              "start": 10,
              "tokens": [
                {
                  "end": 20,
                  "loc": {
                    "end": {
                      "column": 20,
                      "line": 1,
                    },
                    "start": {
                      "column": 10,
                      "line": 1,
                    },
                  },
                  "range": [
                    10,
                    20,
                  ],
                  "start": 10,
                  "type": "Punctuator",
                  "value": "<template>",
                },
                [Circular],
                {
                  "end": 36,
                  "loc": {
                    "end": {
                      "column": 36,
                      "line": 1,
                    },
                    "start": {
                      "column": 25,
                      "line": 1,
                    },
                  },
                  "range": [
                    25,
                    36,
                  ],
                  "start": 25,
                  "type": "Punctuator",
                  "value": "</template>",
                },
              ],
              "type": "GlimmerTemplate",
            },
            "range": [
              20,
              25,
            ],
            "start": 20,
            "type": "GlimmerTextNode",
            "value": "hello",
          },
          {
            "type": "Punctuator",
            "value": "</template>",
          },
        ],
        "type": "GlimmerTemplate",
      }
    `);
  });

  it("GlimmerElementNode with text child", () => {
    const ast = parse(`const x = <template><h1>Hello</h1></template>;`);
    const template = ast.program.body[0].declarations[0].init;
    const element = template.body[0];

    expect(element.type).toBe("GlimmerElementNode");
    expect(stripPositions(element)).toMatchInlineSnapshot(`
      {
        "attributes": [],
        "blockParamNodes": [],
        "blockParams": [],
        "children": [
          {
            "chars": "Hello",
            "type": "GlimmerTextNode",
            "value": "Hello",
          },
        ],
        "closeTag": {
          "data": {
            "hbsPositions": {},
            "kind": "HbsPosition",
            "source": Source {
              "module": "an unknown module",
              "source": "<h1>Hello</h1>",
            },
          },
          "isInvisible": false,
        },
        "comments": [],
        "modifiers": [],
        "name": "h1",
        "openTag": {
          "data": {
            "hbsPositions": {},
            "kind": "HbsPosition",
            "source": {
              "module": "an unknown module",
              "source": "<h1>Hello</h1>",
            },
          },
          "isInvisible": false,
        },
        "params": [],
        "parts": [
          {
            "name": "h1",
            "original": "h1",
            "type": "GlimmerElementNodePart",
          },
        ],
        "path": {
          "head": {
            "name": "h1",
            "original": "h1",
            "type": "VarHead",
          },
          "original": "h1",
          "tail": [],
          "type": "PathExpression",
        },
        "selfClosing": false,
        "tag": "h1",
        "type": "GlimmerElementNode",
      }
    `);
  });

  it("GlimmerElementNode self-closing", () => {
    const ast = parse(`const x = <template><br /></template>;`);
    const template = ast.program.body[0].declarations[0].init;
    const br = template.body[0];

    expect(br.type).toBe("GlimmerElementNode");
    expect(br.selfClosing).toBe(true);
    expect(br.tag).toBe("br");
    expect(br.children).toEqual([]);
  });

  it("GlimmerMustacheStatement", () => {
    const ast = parse(`const x = <template>{{@name}}</template>;`);
    const template = ast.program.body[0].declarations[0].init;
    const mustache = template.body[0];

    expect(mustache.type).toBe("GlimmerMustacheStatement");
    expect(stripPositions(mustache)).toMatchInlineSnapshot(`
      {
        "hash": null,
        "params": [],
        "path": {
          "head": {
            "name": "@name",
            "original": "@name",
            "type": "AtHead",
          },
          "original": "@name",
          "tail": [],
          "type": "GlimmerPathExpression",
        },
        "strip": {
          "close": false,
          "open": false,
        },
        "trusting": false,
        "type": "GlimmerMustacheStatement",
      }
    `);
  });

  it("GlimmerAttrNode", () => {
    const ast = parse(`const x = <template><div class="main"></div></template>;`);
    const template = ast.program.body[0].declarations[0].init;
    const element = template.body[0];
    const attr = element.attributes[0];

    expect(attr.type).toBe("GlimmerAttrNode");
    expect(stripPositions(attr)).toMatchInlineSnapshot(`
      {
        "name": "class",
        "type": "GlimmerAttrNode",
        "value": {
          "chars": "main",
          "type": "GlimmerTextNode",
          "value": "main",
        },
      }
    `);
  });

  it("GlimmerBlockStatement (each)", () => {
    const ast = parse(
      `const x = <template>{{#each @items as |item|}}{{item}}{{/each}}</template>;`,
    );
    const template = ast.program.body[0].declarations[0].init;
    const block = template.body[0];

    expect(block.type).toBe("GlimmerBlockStatement");
    expect(block.path.type).toBe("GlimmerPathExpression");
    expect(block.path.original).toBe("each");
    expect(block.params[0].type).toBe("GlimmerPathExpression");
    expect(block.params[0].original).toBe("@items");
  });
});

describe("AST snapshots — full templates (positions stripped)", () => {
  it("simple component with text", () => {
    const source = `const Greeting = <template><h1>Hello</h1></template>;`;
    const ast = parse(source);
    const template = ast.program.body[0].declarations[0].init;

    expect(stripPositions(template)).toMatchInlineSnapshot(`
      {
        "blockParamNodes": [],
        "blockParams": [],
        "body": [
          {
            "attributes": [],
            "blockParamNodes": [],
            "blockParams": [],
            "children": [
              {
                "chars": "Hello",
                "type": "GlimmerTextNode",
                "value": "Hello",
              },
            ],
            "closeTag": {
              "data": {
                "hbsPositions": {},
                "kind": "HbsPosition",
                "source": Source {
                  "module": "an unknown module",
                  "source": "<h1>Hello</h1>",
                },
              },
              "isInvisible": false,
            },
            "comments": [],
            "modifiers": [],
            "name": "h1",
            "openTag": {
              "data": {
                "hbsPositions": {},
                "kind": "HbsPosition",
                "source": {
                  "module": "an unknown module",
                  "source": "<h1>Hello</h1>",
                },
              },
              "isInvisible": false,
            },
            "params": [],
            "parts": [
              {
                "name": "h1",
                "original": "h1",
                "type": "GlimmerElementNodePart",
              },
            ],
            "path": {
              "head": {
                "name": "h1",
                "original": "h1",
                "type": "VarHead",
              },
              "original": "h1",
              "tail": [],
              "type": "PathExpression",
            },
            "selfClosing": false,
            "tag": "h1",
            "type": "GlimmerElementNode",
          },
        ],
        "contents": "<h1>Hello</h1>",
        "tokens": [
          {
            "type": "Punctuator",
            "value": "<template>",
          },
          {
            "type": "Punctuator",
            "value": "<",
          },
          {
            "type": "word",
            "value": "h1",
          },
          {
            "type": "Punctuator",
            "value": ">",
          },
          {
            "chars": "Hello",
            "end": 36,
            "loc": {
              "end": {
                "column": 36,
                "line": 1,
              },
              "start": {
                "column": 31,
                "line": 1,
              },
            },
            "parent": {
              "attributes": [],
              "blockParamNodes": [],
              "blockParams": [],
              "children": [
                [Circular],
              ],
              "closeTag": {
                "end": {
                  "column": 14,
                  "line": 1,
                },
                "start": {
                  "column": 9,
                  "line": 1,
                },
              },
              "comments": [],
              "end": 41,
              "loc": {
                "end": {
                  "column": 41,
                  "line": 1,
                },
                "start": {
                  "column": 27,
                  "line": 1,
                },
              },
              "modifiers": [],
              "name": "h1",
              "openTag": {
                "end": {
                  "column": 4,
                  "line": 1,
                },
                "start": {
                  "column": 0,
                  "line": 1,
                },
              },
              "params": [],
              "parent": {
                "blockParamNodes": [],
                "blockParams": [],
                "body": [
                  [Circular],
                ],
                "contents": "<h1>Hello</h1>",
                "end": 52,
                "loc": {
                  "end": {
                    "column": 52,
                    "line": 1,
                  },
                  "start": {
                    "column": 17,
                    "line": 1,
                  },
                },
                "parent": null,
                "range": [
                  17,
                  52,
                ],
                "start": 17,
                "tokens": [
                  {
                    "end": 27,
                    "loc": {
                      "end": {
                        "column": 27,
                        "line": 1,
                      },
                      "start": {
                        "column": 17,
                        "line": 1,
                      },
                    },
                    "range": [
                      17,
                      27,
                    ],
                    "start": 17,
                    "type": "Punctuator",
                    "value": "<template>",
                  },
                  {
                    "end": 28,
                    "loc": {
                      "end": {
                        "column": 28,
                        "index": 28,
                        "line": 1,
                      },
                      "start": {
                        "column": 27,
                        "index": 27,
                        "line": 1,
                      },
                    },
                    "range": [
                      27,
                      28,
                    ],
                    "start": 27,
                    "type": "Punctuator",
                    "value": "<",
                  },
                  {
                    "end": 30,
                    "loc": {
                      "end": {
                        "column": 30,
                        "index": 30,
                        "line": 1,
                      },
                      "start": {
                        "column": 28,
                        "index": 28,
                        "line": 1,
                      },
                    },
                    "range": [
                      28,
                      30,
                    ],
                    "start": 28,
                    "type": "word",
                    "value": "h1",
                  },
                  {
                    "end": 31,
                    "loc": {
                      "end": {
                        "column": 31,
                        "index": 31,
                        "line": 1,
                      },
                      "start": {
                        "column": 30,
                        "index": 30,
                        "line": 1,
                      },
                    },
                    "range": [
                      30,
                      31,
                    ],
                    "start": 30,
                    "type": "Punctuator",
                    "value": ">",
                  },
                  [Circular],
                  {
                    "end": 37,
                    "loc": {
                      "end": {
                        "column": 37,
                        "index": 37,
                        "line": 1,
                      },
                      "start": {
                        "column": 36,
                        "index": 36,
                        "line": 1,
                      },
                    },
                    "range": [
                      36,
                      37,
                    ],
                    "start": 36,
                    "type": "Punctuator",
                    "value": "<",
                  },
                  {
                    "end": 38,
                    "loc": {
                      "end": {
                        "column": 38,
                        "index": 38,
                        "line": 1,
                      },
                      "start": {
                        "column": 37,
                        "index": 37,
                        "line": 1,
                      },
                    },
                    "range": [
                      37,
                      38,
                    ],
                    "start": 37,
                    "type": "Punctuator",
                    "value": "/",
                  },
                  {
                    "end": 40,
                    "loc": {
                      "end": {
                        "column": 40,
                        "index": 40,
                        "line": 1,
                      },
                      "start": {
                        "column": 38,
                        "index": 38,
                        "line": 1,
                      },
                    },
                    "range": [
                      38,
                      40,
                    ],
                    "start": 38,
                    "type": "word",
                    "value": "h1",
                  },
                  {
                    "end": 41,
                    "loc": {
                      "end": {
                        "column": 41,
                        "index": 41,
                        "line": 1,
                      },
                      "start": {
                        "column": 40,
                        "index": 40,
                        "line": 1,
                      },
                    },
                    "range": [
                      40,
                      41,
                    ],
                    "start": 40,
                    "type": "Punctuator",
                    "value": ">",
                  },
                  {
                    "end": 52,
                    "loc": {
                      "end": {
                        "column": 52,
                        "line": 1,
                      },
                      "start": {
                        "column": 41,
                        "line": 1,
                      },
                    },
                    "range": [
                      41,
                      52,
                    ],
                    "start": 41,
                    "type": "Punctuator",
                    "value": "</template>",
                  },
                ],
                "type": "GlimmerTemplate",
              },
              "parts": [
                {
                  "end": 30,
                  "loc": {
                    "end": {
                      "column": 30,
                      "line": 1,
                    },
                    "start": {
                      "column": 28,
                      "line": 1,
                    },
                  },
                  "name": "h1",
                  "original": "h1",
                  "parent": [Circular],
                  "range": [
                    28,
                    30,
                  ],
                  "start": 28,
                  "type": "GlimmerElementNodePart",
                },
              ],
              "path": {
                "head": {
                  "loc": {
                    "end": {
                      "column": 3,
                      "line": 1,
                    },
                    "start": {
                      "column": 1,
                      "line": 1,
                    },
                  },
                  "name": "h1",
                  "original": "h1",
                  "type": "VarHead",
                },
                "loc": {
                  "end": {
                    "column": 3,
                    "line": 1,
                  },
                  "start": {
                    "column": 1,
                    "line": 1,
                  },
                },
                "original": "h1",
                "tail": [],
                "type": "PathExpression",
              },
              "range": [
                27,
                41,
              ],
              "selfClosing": false,
              "start": 27,
              "tag": "h1",
              "type": "GlimmerElementNode",
            },
            "range": [
              31,
              36,
            ],
            "start": 31,
            "type": "GlimmerTextNode",
            "value": "Hello",
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
            "value": "h1",
          },
          {
            "type": "Punctuator",
            "value": ">",
          },
          {
            "type": "Punctuator",
            "value": "</template>",
          },
        ],
        "type": "GlimmerTemplate",
      }
    `);
  });

  it("element with attributes and mustache", () => {
    const source = `const x = <template><div class="main">{{@content}}</div></template>;`;
    const ast = parse(source);
    const template = ast.program.body[0].declarations[0].init;

    expect(stripPositions(template)).toMatchInlineSnapshot(`
      {
        "blockParamNodes": [],
        "blockParams": [],
        "body": [
          {
            "attributes": [
              {
                "name": "class",
                "type": "GlimmerAttrNode",
                "value": {
                  "chars": "main",
                  "type": "GlimmerTextNode",
                  "value": "main",
                },
              },
            ],
            "blockParamNodes": [],
            "blockParams": [],
            "children": [
              {
                "hash": null,
                "params": [],
                "path": {
                  "head": {
                    "name": "@content",
                    "original": "@content",
                    "type": "AtHead",
                  },
                  "original": "@content",
                  "tail": [],
                  "type": "GlimmerPathExpression",
                },
                "strip": {
                  "close": false,
                  "open": false,
                },
                "trusting": false,
                "type": "GlimmerMustacheStatement",
              },
            ],
            "closeTag": {
              "data": {
                "hbsPositions": {},
                "kind": "HbsPosition",
                "source": Source {
                  "module": "an unknown module",
                  "source": "<div class="main">{{@content}}</div>",
                },
              },
              "isInvisible": false,
            },
            "comments": [],
            "modifiers": [],
            "name": "div",
            "openTag": {
              "data": {
                "hbsPositions": {},
                "kind": "HbsPosition",
                "source": {
                  "module": "an unknown module",
                  "source": "<div class="main">{{@content}}</div>",
                },
              },
              "isInvisible": false,
            },
            "params": [],
            "parts": [
              {
                "name": "div",
                "original": "div",
                "type": "GlimmerElementNodePart",
              },
            ],
            "path": {
              "head": {
                "name": "div",
                "original": "div",
                "type": "VarHead",
              },
              "original": "div",
              "tail": [],
              "type": "PathExpression",
            },
            "selfClosing": false,
            "tag": "div",
            "type": "GlimmerElementNode",
          },
        ],
        "contents": "<div class="main">{{@content}}</div>",
        "tokens": [
          {
            "type": "Punctuator",
            "value": "<template>",
          },
          {
            "type": "Punctuator",
            "value": "<",
          },
          {
            "type": "word",
            "value": "div",
          },
          {
            "type": "word",
            "value": "class",
          },
          {
            "type": "Punctuator",
            "value": "=",
          },
          {
            "chars": "main",
            "end": 37,
            "loc": {
              "end": {
                "column": 37,
                "line": 1,
              },
              "start": {
                "column": 31,
                "line": 1,
              },
            },
            "parent": {
              "end": 37,
              "loc": {
                "end": {
                  "column": 37,
                  "line": 1,
                },
                "start": {
                  "column": 25,
                  "line": 1,
                },
              },
              "name": "class",
              "parent": {
                "attributes": [
                  [Circular],
                ],
                "blockParamNodes": [],
                "blockParams": [],
                "children": [
                  {
                    "end": 50,
                    "hash": null,
                    "loc": {
                      "end": {
                        "column": 50,
                        "line": 1,
                      },
                      "start": {
                        "column": 38,
                        "line": 1,
                      },
                    },
                    "params": [],
                    "parent": [Circular],
                    "path": {
                      "end": 48,
                      "head": {
                        "end": 48,
                        "loc": {
                          "end": {
                            "column": 48,
                            "line": 1,
                          },
                          "start": {
                            "column": 40,
                            "line": 1,
                          },
                        },
                        "name": "@content",
                        "original": "@content",
                        "range": [
                          40,
                          48,
                        ],
                        "start": 40,
                        "type": "AtHead",
                      },
                      "loc": {
                        "end": {
                          "column": 48,
                          "line": 1,
                        },
                        "start": {
                          "column": 40,
                          "line": 1,
                        },
                      },
                      "original": "@content",
                      "parent": [Circular],
                      "range": [
                        40,
                        48,
                      ],
                      "start": 40,
                      "tail": [],
                      "type": "GlimmerPathExpression",
                    },
                    "range": [
                      38,
                      50,
                    ],
                    "start": 38,
                    "strip": {
                      "close": false,
                      "open": false,
                    },
                    "trusting": false,
                    "type": "GlimmerMustacheStatement",
                  },
                ],
                "closeTag": {
                  "end": {
                    "column": 36,
                    "line": 1,
                  },
                  "start": {
                    "column": 30,
                    "line": 1,
                  },
                },
                "comments": [],
                "end": 56,
                "loc": {
                  "end": {
                    "column": 56,
                    "line": 1,
                  },
                  "start": {
                    "column": 20,
                    "line": 1,
                  },
                },
                "modifiers": [],
                "name": "div",
                "openTag": {
                  "end": {
                    "column": 18,
                    "line": 1,
                  },
                  "start": {
                    "column": 0,
                    "line": 1,
                  },
                },
                "params": [],
                "parent": {
                  "blockParamNodes": [],
                  "blockParams": [],
                  "body": [
                    [Circular],
                  ],
                  "contents": "<div class="main">{{@content}}</div>",
                  "end": 67,
                  "loc": {
                    "end": {
                      "column": 67,
                      "line": 1,
                    },
                    "start": {
                      "column": 10,
                      "line": 1,
                    },
                  },
                  "parent": null,
                  "range": [
                    10,
                    67,
                  ],
                  "start": 10,
                  "tokens": [
                    {
                      "end": 20,
                      "loc": {
                        "end": {
                          "column": 20,
                          "line": 1,
                        },
                        "start": {
                          "column": 10,
                          "line": 1,
                        },
                      },
                      "range": [
                        10,
                        20,
                      ],
                      "start": 10,
                      "type": "Punctuator",
                      "value": "<template>",
                    },
                    {
                      "end": 21,
                      "loc": {
                        "end": {
                          "column": 21,
                          "index": 21,
                          "line": 1,
                        },
                        "start": {
                          "column": 20,
                          "index": 20,
                          "line": 1,
                        },
                      },
                      "range": [
                        20,
                        21,
                      ],
                      "start": 20,
                      "type": "Punctuator",
                      "value": "<",
                    },
                    {
                      "end": 24,
                      "loc": {
                        "end": {
                          "column": 24,
                          "index": 24,
                          "line": 1,
                        },
                        "start": {
                          "column": 21,
                          "index": 21,
                          "line": 1,
                        },
                      },
                      "range": [
                        21,
                        24,
                      ],
                      "start": 21,
                      "type": "word",
                      "value": "div",
                    },
                    {
                      "end": 30,
                      "loc": {
                        "end": {
                          "column": 30,
                          "index": 30,
                          "line": 1,
                        },
                        "start": {
                          "column": 25,
                          "index": 25,
                          "line": 1,
                        },
                      },
                      "range": [
                        25,
                        30,
                      ],
                      "start": 25,
                      "type": "word",
                      "value": "class",
                    },
                    {
                      "end": 31,
                      "loc": {
                        "end": {
                          "column": 31,
                          "index": 31,
                          "line": 1,
                        },
                        "start": {
                          "column": 30,
                          "index": 30,
                          "line": 1,
                        },
                      },
                      "range": [
                        30,
                        31,
                      ],
                      "start": 30,
                      "type": "Punctuator",
                      "value": "=",
                    },
                    [Circular],
                    {
                      "end": 38,
                      "loc": {
                        "end": {
                          "column": 38,
                          "index": 38,
                          "line": 1,
                        },
                        "start": {
                          "column": 37,
                          "index": 37,
                          "line": 1,
                        },
                      },
                      "range": [
                        37,
                        38,
                      ],
                      "start": 37,
                      "type": "Punctuator",
                      "value": ">",
                    },
                    {
                      "end": 39,
                      "loc": {
                        "end": {
                          "column": 39,
                          "index": 39,
                          "line": 1,
                        },
                        "start": {
                          "column": 38,
                          "index": 38,
                          "line": 1,
                        },
                      },
                      "range": [
                        38,
                        39,
                      ],
                      "start": 38,
                      "type": "Punctuator",
                      "value": "{",
                    },
                    {
                      "end": 40,
                      "loc": {
                        "end": {
                          "column": 40,
                          "index": 40,
                          "line": 1,
                        },
                        "start": {
                          "column": 39,
                          "index": 39,
                          "line": 1,
                        },
                      },
                      "range": [
                        39,
                        40,
                      ],
                      "start": 39,
                      "type": "Punctuator",
                      "value": "{",
                    },
                    {
                      "end": 41,
                      "loc": {
                        "end": {
                          "column": 41,
                          "index": 41,
                          "line": 1,
                        },
                        "start": {
                          "column": 40,
                          "index": 40,
                          "line": 1,
                        },
                      },
                      "range": [
                        40,
                        41,
                      ],
                      "start": 40,
                      "type": "Punctuator",
                      "value": "@",
                    },
                    {
                      "end": 48,
                      "loc": {
                        "end": {
                          "column": 48,
                          "index": 48,
                          "line": 1,
                        },
                        "start": {
                          "column": 41,
                          "index": 41,
                          "line": 1,
                        },
                      },
                      "range": [
                        41,
                        48,
                      ],
                      "start": 41,
                      "type": "word",
                      "value": "content",
                    },
                    {
                      "end": 49,
                      "loc": {
                        "end": {
                          "column": 49,
                          "index": 49,
                          "line": 1,
                        },
                        "start": {
                          "column": 48,
                          "index": 48,
                          "line": 1,
                        },
                      },
                      "range": [
                        48,
                        49,
                      ],
                      "start": 48,
                      "type": "Punctuator",
                      "value": "}",
                    },
                    {
                      "end": 50,
                      "loc": {
                        "end": {
                          "column": 50,
                          "index": 50,
                          "line": 1,
                        },
                        "start": {
                          "column": 49,
                          "index": 49,
                          "line": 1,
                        },
                      },
                      "range": [
                        49,
                        50,
                      ],
                      "start": 49,
                      "type": "Punctuator",
                      "value": "}",
                    },
                    {
                      "end": 51,
                      "loc": {
                        "end": {
                          "column": 51,
                          "index": 51,
                          "line": 1,
                        },
                        "start": {
                          "column": 50,
                          "index": 50,
                          "line": 1,
                        },
                      },
                      "range": [
                        50,
                        51,
                      ],
                      "start": 50,
                      "type": "Punctuator",
                      "value": "<",
                    },
                    {
                      "end": 52,
                      "loc": {
                        "end": {
                          "column": 52,
                          "index": 52,
                          "line": 1,
                        },
                        "start": {
                          "column": 51,
                          "index": 51,
                          "line": 1,
                        },
                      },
                      "range": [
                        51,
                        52,
                      ],
                      "start": 51,
                      "type": "Punctuator",
                      "value": "/",
                    },
                    {
                      "end": 55,
                      "loc": {
                        "end": {
                          "column": 55,
                          "index": 55,
                          "line": 1,
                        },
                        "start": {
                          "column": 52,
                          "index": 52,
                          "line": 1,
                        },
                      },
                      "range": [
                        52,
                        55,
                      ],
                      "start": 52,
                      "type": "word",
                      "value": "div",
                    },
                    {
                      "end": 56,
                      "loc": {
                        "end": {
                          "column": 56,
                          "index": 56,
                          "line": 1,
                        },
                        "start": {
                          "column": 55,
                          "index": 55,
                          "line": 1,
                        },
                      },
                      "range": [
                        55,
                        56,
                      ],
                      "start": 55,
                      "type": "Punctuator",
                      "value": ">",
                    },
                    {
                      "end": 67,
                      "loc": {
                        "end": {
                          "column": 67,
                          "line": 1,
                        },
                        "start": {
                          "column": 56,
                          "line": 1,
                        },
                      },
                      "range": [
                        56,
                        67,
                      ],
                      "start": 56,
                      "type": "Punctuator",
                      "value": "</template>",
                    },
                  ],
                  "type": "GlimmerTemplate",
                },
                "parts": [
                  {
                    "end": 24,
                    "loc": {
                      "end": {
                        "column": 24,
                        "line": 1,
                      },
                      "start": {
                        "column": 21,
                        "line": 1,
                      },
                    },
                    "name": "div",
                    "original": "div",
                    "parent": [Circular],
                    "range": [
                      21,
                      24,
                    ],
                    "start": 21,
                    "type": "GlimmerElementNodePart",
                  },
                ],
                "path": {
                  "head": {
                    "loc": {
                      "end": {
                        "column": 4,
                        "line": 1,
                      },
                      "start": {
                        "column": 1,
                        "line": 1,
                      },
                    },
                    "name": "div",
                    "original": "div",
                    "type": "VarHead",
                  },
                  "loc": {
                    "end": {
                      "column": 4,
                      "line": 1,
                    },
                    "start": {
                      "column": 1,
                      "line": 1,
                    },
                  },
                  "original": "div",
                  "tail": [],
                  "type": "PathExpression",
                },
                "range": [
                  20,
                  56,
                ],
                "selfClosing": false,
                "start": 20,
                "tag": "div",
                "type": "GlimmerElementNode",
              },
              "range": [
                25,
                37,
              ],
              "start": 25,
              "type": "GlimmerAttrNode",
              "value": [Circular],
            },
            "range": [
              31,
              37,
            ],
            "start": 31,
            "type": "GlimmerTextNode",
            "value": "main",
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
            "value": "@",
          },
          {
            "type": "word",
            "value": "content",
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
            "value": "div",
          },
          {
            "type": "Punctuator",
            "value": ">",
          },
          {
            "type": "Punctuator",
            "value": "</template>",
          },
        ],
        "type": "GlimmerTemplate",
      }
    `);
  });
});

describe("AST snapshots — ranges and locs", () => {
  it("node ranges are correct byte offsets into the source", () => {
    const source = `const x = <template><h1>Hello</h1></template>;`;
    const ast = parse(source);
    const template = ast.program.body[0].declarations[0].init;

    // GlimmerTemplate range covers the full <template>...</template>
    expect(template.type).toBe("GlimmerTemplate");
    expect(source.slice(template.start, template.end)).toBe("<template><h1>Hello</h1></template>");

    // GlimmerElementNode range covers <h1>Hello</h1>
    const h1 = template.body[0];
    expect(h1.type).toBe("GlimmerElementNode");
    expect(source.slice(h1.start, h1.end)).toBe("<h1>Hello</h1>");

    // GlimmerTextNode range covers "Hello"
    const text = h1.children[0];
    expect(text.type).toBe("GlimmerTextNode");
    expect(source.slice(text.start, text.end)).toBe("Hello");
  });

  it("node locs have correct line/column", () => {
    const source = `const x = <template><h1>Hello</h1></template>;`;
    const ast = parse(source);
    const template = ast.program.body[0].declarations[0].init;

    // Template starts at column 10
    expect(template.loc.start).toEqual({ line: 1, column: 10 });

    // h1 starts at column 20
    const h1 = template.body[0];
    expect(h1.loc.start).toEqual({ line: 1, column: 20 });
  });

  it("multi-line template has correct locs", () => {
    const source = `const x = <template>
  <h1>Hello</h1>
</template>;`;
    const ast = parse(source);
    const template = ast.program.body[0].declarations[0].init;

    // Template starts at line 1, column 10
    expect(template.loc.start).toEqual({ line: 1, column: 10 });
    // Template ends at line 3, column 11
    expect(template.loc.end).toEqual({ line: 3, column: 11 });

    // h1 is on line 2
    const h1 = template.body[0];
    expect(h1.loc.start.line).toBe(2);
  });

  it("multiple templates have correct independent ranges", () => {
    const source = `const A = <template><p>first</p></template>;
const B = <template><p>second</p></template>;`;
    const ast = parse(source);

    const templateA = ast.program.body[0].declarations[0].init;
    const templateB = ast.program.body[1].declarations[0].init;

    expect(source.slice(templateA.start, templateA.end)).toBe("<template><p>first</p></template>");
    expect(source.slice(templateB.start, templateB.end)).toBe("<template><p>second</p></template>");
  });

  it("PathExpression head has correct range", () => {
    const source = `const x = <template>{{@name}}</template>;`;
    const ast = parse(source);
    const template = ast.program.body[0].declarations[0].init;
    const mustache = template.body[0];
    const path = mustache.path;

    expect(path.type).toBe("GlimmerPathExpression");
    expect(source.slice(path.start, path.end)).toBe("@name");
  });

  it("ElementNode parts have correct range", () => {
    const source = `const x = <template><MyComponent /></template>;`;
    const ast = parse(source);
    const template = ast.program.body[0].declarations[0].init;
    const element = template.body[0];

    expect(element.parts.length).toBe(1);
    expect(element.parts[0].type).toBe("GlimmerElementNodePart");
    expect(element.parts[0].name).toBe("MyComponent");
    expect(source.slice(element.parts[0].start, element.parts[0].end)).toBe("MyComponent");
  });
});

describe("AST snapshots — JS/TS wrapper nodes", () => {
  it("full file structure for simple gjs", () => {
    const source = `const x = <template>hello</template>;`;
    const ast = parse(source);

    expect(stripPositions(ast.program.body[0])).toMatchInlineSnapshot(`
      {
        "declarations": [
          {
            "definite": false,
            "id": {
              "decorators": [],
              "name": "x",
              "optional": false,
              "type": "Identifier",
              "typeAnnotation": null,
            },
            "init": {
              "blockParamNodes": [],
              "blockParams": [],
              "body": [
                {
                  "chars": "hello",
                  "type": "GlimmerTextNode",
                  "value": "hello",
                },
              ],
              "contents": "hello",
              "tokens": [
                {
                  "type": "Punctuator",
                  "value": "<template>",
                },
                {
                  "chars": "hello",
                  "end": 25,
                  "loc": {
                    "end": {
                      "column": 25,
                      "line": 1,
                    },
                    "start": {
                      "column": 20,
                      "line": 1,
                    },
                  },
                  "parent": {
                    "blockParamNodes": [],
                    "blockParams": [],
                    "body": [
                      [Circular],
                    ],
                    "contents": "hello",
                    "end": 36,
                    "loc": {
                      "end": {
                        "column": 36,
                        "line": 1,
                      },
                      "start": {
                        "column": 10,
                        "line": 1,
                      },
                    },
                    "parent": null,
                    "range": [
                      10,
                      36,
                    ],
                    "start": 10,
                    "tokens": [
                      {
                        "end": 20,
                        "loc": {
                          "end": {
                            "column": 20,
                            "line": 1,
                          },
                          "start": {
                            "column": 10,
                            "line": 1,
                          },
                        },
                        "range": [
                          10,
                          20,
                        ],
                        "start": 10,
                        "type": "Punctuator",
                        "value": "<template>",
                      },
                      [Circular],
                      {
                        "end": 36,
                        "loc": {
                          "end": {
                            "column": 36,
                            "line": 1,
                          },
                          "start": {
                            "column": 25,
                            "line": 1,
                          },
                        },
                        "range": [
                          25,
                          36,
                        ],
                        "start": 25,
                        "type": "Punctuator",
                        "value": "</template>",
                      },
                    ],
                    "type": "GlimmerTemplate",
                  },
                  "range": [
                    20,
                    25,
                  ],
                  "start": 20,
                  "type": "GlimmerTextNode",
                  "value": "hello",
                },
                {
                  "type": "Punctuator",
                  "value": "</template>",
                },
              ],
              "type": "GlimmerTemplate",
            },
            "type": "VariableDeclarator",
          },
        ],
        "declare": false,
        "kind": "const",
        "type": "VariableDeclaration",
      }
    `);
  });

  it("gts with interface and class", () => {
    const source = `interface Args { name: string; }
export default class Greeting {
  <template><h1>Hello</h1></template>
}`;
    const ast = parse(source);
    const body = ast.program.body;

    // First statement is TSInterfaceDeclaration
    expect(body[0].type).toBe("TSInterfaceDeclaration");

    // Second statement is ExportDefaultDeclaration wrapping a ClassDeclaration
    expect(body[1].type).toBe("ExportDefaultDeclaration");
    expect(body[1].declaration.type).toBe("ClassDeclaration");
  });
});
