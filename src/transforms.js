/**
 * Glimmer AST → ESTree transform utilities.
 *
 * Ported from ember-eslint-parser's transforms.js, adapted for
 * ember-estree's ESM architecture. Handles:
 *
 *  - Type prefixing (all Glimmer types get a "Glimmer" prefix)
 *  - Range / loc fixing (converts template-local positions to file-level)
 *  - ElementNode `parts` and `name` fields
 *  - blockParams → virtual node creation
 *  - Empty hash nullification
 *  - Empty text node removal
 */

import * as glimmer from "@glimmer/syntax";

/**
 * Converts between character offsets and line/column positions.
 * Lines are 1-based, columns are 0-based (matching ESTree & Glimmer conventions).
 */
export class DocumentLines {
  constructor(source) {
    this.lineStarts = [0];
    for (let i = 0; i < source.length; i++) {
      if (source[i] === "\n") {
        this.lineStarts.push(i + 1);
      }
    }
  }

  positionToOffset(pos) {
    return this.lineStarts[pos.line - 1] + pos.column;
  }

  offsetToPosition(offset) {
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - this.lineStarts[lo] };
  }
}

/**
 * Traverse a Glimmer AST, set parent references, and categorize nodes.
 */
function collectNodes(ast) {
  const allNodes = [];
  const comments = [];
  const textNodes = [];
  const emptyTextNodes = [];

  glimmer.traverse(ast, {
    All(node, path) {
      node.parent = path.parentNode;
      allNodes.push(node);
      if (node.type === "CommentStatement" || node.type === "MustacheCommentStatement") {
        comments.push(node);
      }
      if (node.type === "TextNode") {
        node.value = node.chars;
        if (node.value.trim().length !== 0 || (node.parent && node.parent.type === "AttrNode")) {
          textNodes.push(node);
        } else {
          emptyTextNodes.push(node);
        }
      }
    },
  });

  return { allNodes, comments, textNodes, emptyTextNodes };
}

/**
 * Remove nodes from their parent's children/body/parts arrays.
 */
function removeFromParent(nodes) {
  for (const node of nodes) {
    const children =
      (node.parent && (node.parent.children || node.parent.body || node.parent.parts)) || [];
    const idx = children.indexOf(node);
    if (idx >= 0) {
      children.splice(idx, 1);
    }
  }
}

/**
 * Glimmer AST visitor keys — defines which properties contain child nodes.
 * Defined explicitly because @glimmer/syntax no longer exports visitorKeys.
 */
const GLIMMER_VISITOR_KEYS = {
  Template: ["body"],
  Block: ["body"],
  MustacheStatement: ["path", "params", "hash"],
  BlockStatement: ["path", "params", "hash", "program", "inverse"],
  ElementModifierStatement: ["path", "params", "hash"],
  CommentStatement: [],
  MustacheCommentStatement: [],
  ElementNode: ["children", "attributes", "modifiers", "comments"],
  AttrNode: ["value"],
  TextNode: [],
  ConcatStatement: ["parts"],
  SubExpression: ["path", "params", "hash"],
  PathExpression: [],
  StringLiteral: [],
  BooleanLiteral: [],
  NumberLiteral: [],
  NullLiteral: [],
  UndefinedLiteral: [],
  Hash: ["pairs"],
  HashPair: ["value"],
};

/**
 * Build the Glimmer visitor keys map with "Glimmer" prefix.
 */
let _cachedGlimmerVisitorKeys = null;
export function buildGlimmerVisitorKeys() {
  if (_cachedGlimmerVisitorKeys) return _cachedGlimmerVisitorKeys;
  const keys = {};
  for (const [k, v] of Object.entries(GLIMMER_VISITOR_KEYS)) {
    keys[`Glimmer${k}`] = [...v];
  }
  if (!keys.GlimmerElementNode.includes("blockParamNodes")) {
    keys.GlimmerElementNode.push("blockParamNodes", "parts");
  }
  keys.GlimmerProgram = ["body", "blockParamNodes"];
  keys.GlimmerTemplate = ["body"];
  _cachedGlimmerVisitorKeys = keys;
  return keys;
}

/**
 * Process a Glimmer AST into an ESTree-compatible form.
 *
 * @param {object} templateAST - The Glimmer AST (from ember-template-recast / @glimmer/syntax)
 * @param {object} opts
 * @param {number} opts.contentOffset - Byte offset where the template content begins in the full source
 * @param {[number, number]} opts.templateRange - [start, end] byte range of the full <template>...</template> block
 * @param {string} opts.source - The full source code
 * @returns {object} The transformed AST
 */
export function processGlimmerTemplate(templateAST, { contentOffset, templateRange, source }) {
  // The Glimmer AST locs are relative to the inner template content only
  const closingTagLen = "</template>".length;
  const contentEnd = templateRange[1] - closingTagLen;
  const contentStr = source.substring(contentOffset, contentEnd);
  const contentDoc = new DocumentLines(contentStr);
  const sourceDoc = new DocumentLines(source);

  const toFileRange = (loc) => {
    const locObj = loc.toJSON ? loc.toJSON() : loc;
    return [
      contentOffset + contentDoc.positionToOffset(locObj.start),
      contentOffset + contentDoc.positionToOffset(locObj.end),
    ];
  };

  const toFileLoc = (range) => ({
    start: sourceDoc.offsetToPosition(range[0]),
    end: sourceDoc.offsetToPosition(range[1]),
  });

  const { allNodes, comments, textNodes, emptyTextNodes } = collectNodes(templateAST);

  for (const n of allNodes) {
    const loc = n.loc.toJSON ? n.loc.toJSON() : n.loc;

    // Fix PathExpression head
    if (n.type === "PathExpression") {
      const head = n.head;
      if (head && head.loc) {
        const headLoc = head.loc.toJSON ? head.loc.toJSON() : head.loc;
        if (headLoc && headLoc.start) {
          head.range = toFileRange(headLoc);
          head.start = head.range[0];
          head.end = head.range[1];
          head.loc = toFileLoc(head.range);
        }
      }
    }

    // Set range — Template root gets the full <template>...</template> range
    n.range = n.type === "Template" ? [...templateRange] : toFileRange(loc);
    n.start = n.range[0];
    n.end = n.range[1];
    n.loc = toFileLoc(n.range);

    // Add parts and name to ElementNode
    if (n.type === "ElementNode") {
      n.name = n.tag;
      // Compute the tag name range: starts 1 char after element start (<), length = tag.length
      const tagStart = n.range[0] + 1; // skip "<"
      const tagEnd = tagStart + n.tag.length;
      const tagRange = [tagStart, tagEnd];
      n.parts = [
        {
          original: n.tag,
          name: n.tag,
          type: "GlimmerElementNodePart",
          range: tagRange,
          start: tagRange[0],
          end: tagRange[1],
          loc: toFileLoc(tagRange),
        },
      ];
    }

    // Handle blockParams
    if ("blockParams" in n && Array.isArray(n.blockParams)) {
      n.blockParamNodes = (n.params || []).map((p) => {
        const paramLoc = p.loc?.toJSON ? p.loc.toJSON() : p.loc;
        const range = paramLoc ? toFileRange(paramLoc) : n.range;
        return {
          ...p,
          type: "BlockParam",
          name: p.original,
          range,
          start: range[0],
          end: range[1],
          loc: toFileLoc(range),
        };
      });
    }

    // Nullify empty hashes
    if (
      (n.type === "MustacheStatement" ||
        n.type === "BlockStatement" ||
        n.type === "SubExpression") &&
      n.hash &&
      n.hash.pairs &&
      n.hash.pairs.length === 0
    ) {
      n.hash = null;
    }

    // Prefix type with "Glimmer"
    n.type = `Glimmer${n.type}`;
  }

  // Clean up AST structure
  removeFromParent(emptyTextNodes);
  removeFromParent(comments);
  for (const comment of comments) {
    comment.type = "Block";
  }

  // Clear parent references (they cause circular JSON issues)
  for (const n of allNodes) {
    n.parent = null;
  }

  return templateAST;
}
