# ember-estree

ESTree-compatible AST parser for Ember's `.gjs` and `.gts` files.

Parses `<template>` tags into [Glimmer](https://github.com/emberjs/ember.js/) AST nodes that are embedded directly in the ESTree, so tools like linters and codemods can work with both the JavaScript/TypeScript _and_ template portions of a single file.

## Install

```bash
pnpm add ember-estree
```

## Usage

### Parsing

`toTree` returns a `File` node whose `.program` is a standard ESTree `Program`, with any `<template>` regions represented as `Glimmer*` AST nodes.

```js
import { toTree } from "ember-estree";

let ast = toTree(`
  import Component from "@glimmer/component";

  export default class Demo extends Component {
    <template>Hello, {{this.name}}!</template>
  }
`);

console.log(ast.type); // "File"
console.log(ast.program.body.length); // 2 — ImportDeclaration + ClassDeclaration
```

`parse` is a lower-level alternative that returns the `Program` node directly.

```js
import { parse } from "ember-estree";

let program = parse(`const x = <template>hi</template>;`);
console.log(program.type); // "Program"
```

### Printing

`print` converts an AST node (ESTree _or_ Glimmer) back to source code.

```js
import { print } from "ember-estree";

print({ type: "Identifier", name: "foo" });
// => "foo"

print({
  type: "GlimmerTemplate",
  body: [{ type: "GlimmerTextNode", chars: "Hello" }],
});
// => "<template>Hello</template>"
```

## Options

Both `toTree` and `parse` accept an options object as their second argument.

All options are optional.

| Option         | Type                                              | Description                                                                                                           |
| -------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `filePath`     | `string`                                          | Used for language detection.                                                                                          |
| `tokens`       | `boolean`                                         | Generate a flat `ast.tokens` array. Required by ESLint; skipped by default so codemods and type-checkers pay nothing. |
| `templateOnly` | `boolean`                                         | Parse the source as a raw Glimmer template. Use for `.hbs` files.                                                     |
| `parser`       | `(placeholderJS: string) => { ast, ... }`         | Use a custom JS/TS parser instead of the default oxc-parser. See [Custom parser](#custom-parser).                     |
| `visitors`     | `VisitorMap` <br /> or `(outerAst) => VisitorMap` | Callbacks fired on every node during traversal — JS/TS and Glimmer — in a single pass. See [Visitors](#visitors).     |

Handler signature is `(node, path) => void`, where `path = { node, parent, parentPath }` — a linked list that walks all the way back through the JS/TS root, so visitors can locate the enclosing scope or class from within a Glimmer subtree.

### Token stream

Pass `tokens: true` to populate `ast.tokens` with a flat, position-sorted array of lexemes spanning the full file — including Glimmer tokens spliced in place of each `<template>` region. This is what ESLint's `SourceCode` needs; omit it for codemods or type-checkers that don't use the token stream.

```js
import { toTree } from "ember-estree";

const result = toTree(source, {
  tokens: true,
  parser: myTsParser,
});
// result.ast.program.tokens now contains JS + Glimmer tokens in source order
```

For `.hbs` files via `templateOnly`, pass both flags:

```js
toTree(hbsSource, { templateOnly: true, tokens: true });
```

### Custom parser

Pass any JS/TS parser that returns an ESTree-compatible AST. ember-estree handles template splicing and Glimmer traversal on top of it.

```js
import { parseSync } from "oxc-parser";
import { toTree } from "ember-estree";

const result = toTree(source, {
  parser: (js) => ({
    ast: parseSync("input.ts", js).program,
    visitorKeys: {
      /* ...parser's visitor keys... */
    },
  }),
});
```

The parser receives a placeholder-JS string (templates replaced with backtick expressions of equal length) and must return at least `{ ast }`. Additional fields like `scopeManager`, `visitorKeys`, or `services` are preserved on the returned result.

### Visitors

Pass `visitors` to observe or rewrite the tree in a single traversal. Handlers fire on both outer JS/TS nodes and spliced Glimmer subtrees, and a single node is never dispatched twice — safe to relocate nodes mid-walk.

The pseudo-type `GlimmerBlockParams` fires on any node that carries a `blockParams` array.

**Plain-object form** — use when you only need the type → handler map:

```js
import { toTree } from "ember-estree";

const identifiers = [];
toTree(source, {
  visitors: {
    Identifier: (node) => identifiers.push(node.name),
    GlimmerPathExpression: (node) => identifiers.push(node.original),
  },
});
```

**Factory form** — use when you need the outer JS/TS AST up front (for example, to attach state to it before the walk):

```js
import { toTree, print } from "ember-estree";

const ast = toTree(`const world = "🌍"; const X = <template>{{world}}</template>;`, {
  visitors: () => ({
    Identifier: (node) => (node.name = node.name.toUpperCase()),
    GlimmerPathExpression(node) {
      node.original = node.original.toUpperCase();
      if (node.head) node.head.name = node.original;
    },
  }),
});

print(ast.program);
// => 'const WORLD = "🌍";\nconst X = <template>{{WORLD}}</template>;'
```

**Collecting Glimmer comments into `program.comments`** — useful when adapting the AST for ESLint, which reads comments from the Program node:

```js
const ast = toTree(source, {
  visitors: (outerAst) => {
    outerAst.program.comments = [...(outerAst.comments ?? [])];
    const push = (node) => outerAst.program.comments.push(node);
    return {
      GlimmerCommentStatement: push,
      GlimmerMustacheCommentStatement: push,
    };
  },
});
```

**Removing nodes mid-traversal** — siblings are splice-safe:

```js
toTree(source, {
  visitors: () => ({
    GlimmerMustacheCommentStatement(node, path) {
      const siblings = path.parent?.body ?? path.parent?.children;
      const idx = siblings?.indexOf(node) ?? -1;
      if (idx >= 0) siblings.splice(idx, 1);
    },
  }),
});
```

## Examples

The [`examples/`](./examples) directory contains ready-to-run integrations:

| Example                                     | Description                                                          |
| ------------------------------------------- | -------------------------------------------------------------------- |
| [`eslint-parser`](./examples/eslint-parser) | Custom ESLint parser that understands `<template>`                   |
| [`zmod`](./examples/zmod)                   | Codemod toolkit using [zmod](https://github.com/nicolo-ribaudo/zmod) |

## License

MIT
