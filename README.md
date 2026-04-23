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

| Option               | Type                                             | Description                                                                                                                                                            |
| -------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `filePath`           | `string`                                         | Used for language detection.                                                                                                                                           |
| `templateOnly`       | `boolean`                                        | Parse the source as a raw Glimmer template. Use for `.hbs` files.                                                                                                      |
| `includeParentLinks` | `boolean`                                        | Include `parent` back-references on Glimmer nodes. Defaults to `true`; set to `false` for JSON-serializable output.                                                    |
| `parser`             | `(placeholderJS: string) => { ast, ... }`        | Use a custom JS/TS parser instead of the default oxc-parser. See [Custom parser](#custom-parser).                                                                      |
| `visitors`           | `{ [GlimmerType]: (node, path) => void }`        | Callbacks fired on each Glimmer node during traversal.                                                                                                                 |
| `modify`             | `(outerAst) => { [Type]: (node, path) => void }` | Mutate the AST during the initial parse — handlers fire on **every** node, JS/TS and Glimmer, in a single pass. See [Mutating the AST](#mutating-the-ast-with-modify). |

Visitor handlers receive `(node, path)` where `path = { node, parent, parentPath }` — a linked list walking back to the root.

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

### Mutating the AST with `modify`

Tools like ESLint and codemods often need to rewrite the tree as it's produced. The `modify` hook runs alongside the normal traversal so there's no second pass.

`modify` is called once with the outer JS/TS AST immediately after parsing, before any templates are spliced in. The visitors it returns fire on both outer JS/TS nodes and spliced Glimmer subtrees during the same traversal. Handlers may mutate, relocate, or splice nodes; a single node is never dispatched twice, even after it's moved elsewhere.

**Renaming identifiers across JS and Glimmer in one pass:**

```js
import { toTree, print } from "ember-estree";

const ast = toTree(`const world = "🌍"; const X = <template>{{world}}</template>;`, {
  modify: () => ({
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
  modify: (outerAst) => {
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
  modify: () => ({
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
