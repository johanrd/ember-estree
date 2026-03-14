import { toTree, print } from "ember-estree";
import { Transformer } from "content-tag-utils";

/**
 * Compute byte-offset lookup table from source lines.
 * Returns an array where lineOffsets[line] = byte offset of the
 * first character on that (1-based) line.
 */
function buildLineOffsets(source) {
  const offsets = [0, 0]; // 1-based indexing
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") {
      offsets.push(i + 1);
    }
  }
  return offsets;
}

/**
 * Find all Template nodes in the AST and compute byte offsets
 * for their Glimmer child nodes using the template content ranges.
 */
function prepareGlimmerOffsets(ast, source) {
  const t = new Transformer(source);

  for (const parseResult of t.parseResults) {
    // Find where the template content starts in the full source
    const fullTemplate = source.substring(parseResult.range.start, parseResult.range.end);
    const tagEnd = fullTemplate.indexOf(">") + 1;
    const contentOffset = parseResult.range.start + tagEnd;

    // Get the template content and build its line offsets
    const content = source.substring(contentOffset, parseResult.range.end);
    const lineOffsets = buildLineOffsets(content);

    // Find the Template node in the AST that corresponds to this range
    // and set start/end on all its Glimmer descendants
    walkForTemplates(ast, lineOffsets, contentOffset, new Set());
  }
}

function walkForTemplates(node, lineOffsets, contentOffset, visited) {
  if (!node || typeof node !== "object" || visited.has(node)) return;
  visited.add(node);

  // Glimmer node types from ember-template-recast
  const glimmerTypes = [
    "Template",
    "ElementNode",
    "TextNode",
    "MustacheStatement",
    "BlockStatement",
    "SubExpression",
    "PathExpression",
    "StringLiteral",
    "BooleanLiteral",
    "NumberLiteral",
    "NullLiteral",
    "UndefinedLiteral",
    "Hash",
    "HashPair",
    "AttrNode",
    "ConcatStatement",
    "CommentStatement",
    "MustacheCommentStatement",
    "ElementModifierStatement",
  ];

  if (node.type && glimmerTypes.includes(node.type) && node.loc) {
    if (typeof node.start !== "number" && node.loc.start) {
      node.start = lineOffsets[node.loc.start.line] + node.loc.start.column + contentOffset;
    }
    if (typeof node.end !== "number" && node.loc.end) {
      node.end = lineOffsets[node.loc.end.line] + node.loc.end.column + contentOffset;
    }
  }

  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "parent") continue;
    const val = node[key];
    if (Array.isArray(val)) {
      for (const item of val) {
        walkForTemplates(item, lineOffsets, contentOffset, visited);
      }
    } else if (val && typeof val === "object") {
      walkForTemplates(val, lineOffsets, contentOffset, visited);
    }
  }
}

/**
 * A zmod `Parser` adapter for ember-estree.
 *
 * Parses .gjs/.gts source into an ESTree-compatible AST with
 * embedded Glimmer template nodes, ensuring all nodes have
 * `start`/`end` byte offsets for zmod's span-based patching.
 *
 * @example
 * ```js
 * import { z } from "zmod";
 * import { emberParser } from "./parser.js";
 *
 * const j = z.withParser(emberParser);
 * const root = j(gjsSource);
 *
 * root.find("ElementNode", { tag: "OldComponent" })
 *     .replaceWith("<NewComponent />");
 *
 * console.log(root.toSource());
 * ```
 */
export const emberParser = {
  parse(code) {
    const ast = toTree(code);
    prepareGlimmerOffsets(ast, code);
    return ast;
  },
  print(node) {
    return print(node);
  },
};
