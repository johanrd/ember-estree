import { toTree, print, removeParentReferences } from "ember-estree";
import { Preprocessor } from "content-tag";

const preprocessor = new Preprocessor();

/**
 * Compute character-offset lookup table from source lines.
 * Returns an array where lineOffsets[line] = character offset of the
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
 * Find all Template nodes in the AST and compute character offsets
 * for their Glimmer child nodes using the template content ranges.
 */
function prepareGlimmerOffsets(ast, source) {
  const parseResults = preprocessor.parse(source);

  for (const parseResult of parseResults) {
    // content-tag v4 provides UTF-16 codepoint offsets directly
    const contentOffset = parseResult.contentRange.startUtf16Codepoint;

    // Get the template content and build its line offsets
    const content = source.substring(contentOffset, parseResult.contentRange.endUtf16Codepoint);
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
    "GlimmerTemplate",
    "GlimmerElementNode",
    "GlimmerTextNode",
    "GlimmerMustacheStatement",
    "GlimmerBlockStatement",
    "GlimmerSubExpression",
    "GlimmerPathExpression",
    "GlimmerStringLiteral",
    "GlimmerBooleanLiteral",
    "GlimmerNumberLiteral",
    "GlimmerNullLiteral",
    "GlimmerUndefinedLiteral",
    "GlimmerHash",
    "GlimmerHashPair",
    "GlimmerAttrNode",
    "GlimmerConcatStatement",
    "GlimmerCommentStatement",
    "GlimmerMustacheCommentStatement",
    "GlimmerElementModifierStatement",
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
 * root.find("GlimmerElementNode", { tag: "OldComponent" })
 *     .replaceWith("<NewComponent />");
 *
 * console.log(root.toSource());
 * ```
 */
export const emberParser = {
  parse(code) {
    const ast = toTree(code);
    prepareGlimmerOffsets(ast, code);
    removeParentReferences(ast);
    return ast;
  },
  print(node) {
    return print(node);
  },
};
