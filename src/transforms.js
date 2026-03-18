/**
 * Glimmer AST → ESTree transform utilities.
 *
 * Handles:
 *  - Parsing raw template content via @glimmer/syntax
 *  - Type prefixing (all Glimmer types get a "Glimmer" prefix)
 *  - Range / loc fixing (converts template-local positions to file-level)
 *  - ElementNode `parts` and `name` fields
 *  - blockParams → virtual node creation
 *  - Empty hash nullification
 *  - Empty text node removal
 *  - Tokenization and token stream building
 */

import {
  traverse as glimmerTraverse,
  visitorKeys as glimmerVisitorKeys,
  preprocess as glimmerPreprocess,
} from "@glimmer/syntax";

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

  glimmerTraverse(ast, {
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
 * Build the Glimmer visitor keys map with "Glimmer" prefix.
 * Uses the visitor keys exported by @glimmer/syntax.
 */
let _cachedGlimmerVisitorKeys = null;
export function buildGlimmerVisitorKeys() {
  if (_cachedGlimmerVisitorKeys) return _cachedGlimmerVisitorKeys;
  const keys = {};
  for (const [k, v] of Object.entries(glimmerVisitorKeys)) {
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

function isAlphaNumeric(code) {
  return !(
    !(code > 47 && code < 58) && // numeric (0-9)
    !(code > 64 && code < 91) && // upper alpha (A-Z)
    !(code > 96 && code < 123)
  );
}

function isWhiteSpaceCode(code) {
  return (
    code === 32 /* space */ ||
    code === 9 /* tab */ ||
    code === 13 /* carriageReturn */ ||
    code === 10 /* lineFeed */ ||
    code === 11 /* verticalTab */
  );
}

/**
 * Simple tokenizer for templates, splits into words and punctuators.
 * @param {string} template
 * @param {DocumentLines} doc
 * @param {number} startOffset
 * @return {object[]}
 */
export function tokenize(template, doc, startOffset) {
  const tokens = [];
  let wordStart = -1;
  function pushToken(value, type, range) {
    tokens.push({
      type,
      value,
      range,
      start: range[0],
      end: range[1],
      loc: {
        start: { ...doc.offsetToPosition(range[0]), index: range[0] },
        end: { ...doc.offsetToPosition(range[1]), index: range[1] },
      },
    });
  }
  for (let i = 0; i < template.length; i++) {
    const code = template.charCodeAt(i);
    if (isAlphaNumeric(code)) {
      if (wordStart < 0) {
        wordStart = i;
      }
    } else {
      if (wordStart >= 0) {
        pushToken(template.slice(wordStart, i), "word", [startOffset + wordStart, startOffset + i]);
        wordStart = -1;
      }
      if (!isWhiteSpaceCode(code)) {
        pushToken(template[i], "Punctuator", [startOffset + i, startOffset + i + 1]);
      }
    }
  }
  if (wordStart >= 0) {
    pushToken(template.slice(wordStart), "word", [
      startOffset + wordStart,
      startOffset + template.length,
    ]);
  }
  return tokens;
}

/**
 * Builds the final token stream by filtering out tokens covered by comments
 * or text nodes, then merging text nodes back in sorted order.
 * @param {object[]} rawTokens
 * @param {object[]} comments
 * @param {object[]} textNodes
 * @return {object[]}
 */
function buildTokenStream(rawTokens, comments, textNodes) {
  const commentIntervals = comments.map((c) => c.range).sort((a, b) => a[0] - b[0]);
  const textNodeIntervals = textNodes.map((t) => t.range).sort((a, b) => a[0] - b[0]);

  function isCovered(tokenRange, intervals) {
    let lo = 0;
    let hi = intervals.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const iv = intervals[mid];
      if (iv[0] <= tokenRange[0] && iv[1] >= tokenRange[1]) {
        return true;
      }
      if (iv[0] > tokenRange[0]) {
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    return false;
  }

  const filteredTokens = rawTokens.filter(
    (t) => !isCovered(t.range, commentIntervals) && !isCovered(t.range, textNodeIntervals),
  );

  const sortedTextNodes = [...textNodes].sort((a, b) => a.range[0] - b.range[0]);
  const result = [];
  let ti = 0;
  for (const token of filteredTokens) {
    while (ti < sortedTextNodes.length && sortedTextNodes[ti].range[0] < token.range[0]) {
      result.push(sortedTextNodes[ti++]);
    }
    result.push(token);
  }
  while (ti < sortedTextNodes.length) {
    result.push(sortedTextNodes[ti++]);
  }

  return result;
}

/**
 * Parses a Glimmer template and produces a processed AST.
 *
 * @param {object} options
 * @param {string} options.templateContent - The template string to parse with glimmer
 * @param {DocumentLines} options.codeLines - DocumentLines for the full source file
 * @param {[number, number]} options.templateRange - Range [start, end] for the Template root node
 * @param {string} [options.tokenSource] - String to tokenize (defaults to templateContent)
 * @return {{ ast: object, comments: object[] }}
 */
export function processGlimmerTemplate({ templateContent, codeLines, templateRange, tokenSource }) {
  const offset = templateRange[0];
  const docLines = new DocumentLines(templateContent);

  const toFileRange = (loc) => [
    offset + docLines.positionToOffset(loc.start),
    offset + docLines.positionToOffset(loc.end),
  ];
  const toFileLoc = (range) => ({
    start: codeLines.offsetToPosition(range[0]),
    end: codeLines.offsetToPosition(range[1]),
  });

  const ast = glimmerPreprocess(templateContent, { mode: "codemod" });
  const { allNodes, comments, textNodes, emptyTextNodes } = collectNodes(ast);

  for (const n of allNodes) {
    if (n.type === "PathExpression") {
      n.head.range = toFileRange(n.head.loc);
      n.head.start = n.head.range[0];
      n.head.end = n.head.range[1];
      n.head.loc = toFileLoc(n.head.range);
    }

    n.range = n.type === "Template" ? [...templateRange] : toFileRange(n.loc);
    n.start = n.range[0];
    n.end = n.range[1];
    n.loc = toFileLoc(n.range);

    if (n.type === "ElementNode") {
      n.name = n.tag;
      n.parts = [n.path.head].map((p) => {
        const range = toFileRange(p.loc);
        return {
          ...p,
          name: p.original,
          parent: n,
          type: "GlimmerElementNodePart",
          range,
          start: range[0],
          end: range[1],
          loc: toFileLoc(range),
        };
      });
    }

    if ("blockParams" in n && Array.isArray(n.blockParams)) {
      n.blockParamNodes = n.blockParams.map((name) => ({
        type: "GlimmerBlockParam",
        name,
        range: [...n.range],
        start: n.range[0],
        end: n.range[1],
        loc: toFileLoc(n.range),
      }));
    }

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

    n.type = `Glimmer${n.type}`;
  }

  removeFromParent(emptyTextNodes);
  removeFromParent(comments);
  for (const comment of comments) {
    comment.type = "Block";
  }

  ast.tokens = buildTokenStream(
    tokenize(tokenSource || templateContent, codeLines, offset),
    comments,
    textNodes,
  );
  ast.contents = templateContent;

  return { ast, comments };
}

/**
 * Traverses an ESTree+Glimmer AST. Merges the provided visitor keys
 * with Glimmer visitor keys for unified traversal.
 *
 * @param {Record<string, string[]>} visitorKeys - ESTree visitor keys
 * @param {object} node - Root AST node
 * @param {function} visitor - Callback receiving a path object
 */
export function traverse(visitorKeys, node, visitor) {
  const allVisitorKeys = { ...visitorKeys, ...buildGlimmerVisitorKeys() };
  const queue = [];

  queue.push({
    node,
    parent: null,
    parentKey: null,
    parentPath: null,
    context: {},
  });

  while (queue.length > 0) {
    const currentPath = queue.pop();

    visitor(currentPath);

    if (!currentPath.node) continue;

    const keys = allVisitorKeys[currentPath.node.type];
    if (!keys) continue;

    for (const key of keys) {
      const child = currentPath.node[key];

      if (!child) {
        continue;
      } else if (Array.isArray(child)) {
        for (const item of child) {
          queue.push({
            node: item,
            parent: currentPath.node,
            context: currentPath.context,
            parentKey: key,
            parentPath: currentPath,
          });
        }
      } else {
        queue.push({
          node: child,
          parent: currentPath.node,
          context: currentPath.context,
          parentKey: key,
          parentPath: currentPath,
        });
      }
    }
  }
}
