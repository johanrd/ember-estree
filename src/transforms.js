/**
 * Glimmer AST → ESTree transform utilities.
 */

import {
  visitorKeys as rawGlimmerVisitorKeys,
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
 * Glimmer visitor keys map with "Glimmer" prefix.
 * Computed once at module load.
 */
export const glimmerVisitorKeys = (() => {
  const keys = {};
  for (const [k, v] of Object.entries(rawGlimmerVisitorKeys)) {
    keys[`Glimmer${k}`] = v;
  }
  keys.GlimmerElementNode = [...keys.GlimmerElementNode, "blockParamNodes", "parts"];
  keys.GlimmerProgram = ["body", "blockParamNodes"];
  keys.GlimmerTemplate = ["body"];
  return keys;
})();

// ── Internal helpers ──────────────────────────────────────────────────

/**
 * Recursively collect all nodes in a Glimmer AST using visitor keys.
 * Sets parent references during traversal.
 */
function collectNodes(node, parent, allNodes, comments, textNodes, emptyTextNodes) {
  node.parent = parent;
  allNodes.push(node);
  if (node.type === "CommentStatement" || node.type === "MustacheCommentStatement") {
    comments.push(node);
  }
  if (node.type === "TextNode") {
    node.value = node.chars;
    if (node.value.trim().length !== 0 || (parent && parent.type === "AttrNode")) {
      textNodes.push(node);
    } else {
      emptyTextNodes.push(node);
    }
  }
  const keys = rawGlimmerVisitorKeys[node.type];
  if (!keys) return;
  for (const key of keys) {
    const child = node[key];
    if (!child) continue;
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === "object" && item.type) {
          collectNodes(item, node, allNodes, comments, textNodes, emptyTextNodes);
        }
      }
    } else if (typeof child === "object" && child.type) {
      collectNodes(child, node, allNodes, comments, textNodes, emptyTextNodes);
    }
  }
}

/**
 * Snapshot getter-heavy properties as plain values on a glimmer node.
 * @glimmer/syntax nodes use getter chains (tag→path→head→original)
 * that cause infinite recursion in esrecurse. We capture the values
 * once and replace the getters with plain properties.
 */
// Reusable descriptor to avoid allocating one per defineProperty call
const _desc = { value: undefined, configurable: true, enumerable: true, writable: true };
function defOwn(obj, key, val) {
  _desc.value = val;
  Object.defineProperty(obj, key, _desc);
}

function snapshotElementNode(n) {
  defOwn(n, "tag", n.tag);
}

function snapshotVarHead(head) {
  defOwn(head, "name", head.name);
  defOwn(head, "original", head.original);
}

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

function isAlphaNumeric(code) {
  return !(!(code > 47 && code < 58) && !(code > 64 && code < 91) && !(code > 96 && code < 123));
}

function isWhiteSpaceCode(code) {
  return code === 32 || code === 9 || code === 13 || code === 10 || code === 11;
}

function tokenize(template, doc, startOffset) {
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
      if (wordStart < 0) wordStart = i;
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

function buildTokenStream(rawTokens, comments, textNodes) {
  const commentIntervals = comments.map((c) => c.range).sort((a, b) => a[0] - b[0]);
  const textNodeIntervals = textNodes.map((t) => t.range).sort((a, b) => a[0] - b[0]);

  function isCovered(tokenRange, intervals) {
    let lo = 0;
    let hi = intervals.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const iv = intervals[mid];
      if (iv[0] <= tokenRange[0] && iv[1] >= tokenRange[1]) return true;
      if (iv[0] > tokenRange[0]) hi = mid - 1;
      else lo = mid + 1;
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
 * Parse and transform a Glimmer template into an ESTree-compatible AST.
 * Internal — consumed by toTree.
 */
export function _processTemplate(templateContent, codeLines, templateRange) {
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
  const allNodes = [];
  const comments = [];
  const textNodes = [];
  const emptyTextNodes = [];
  collectNodes(ast, null, allNodes, comments, textNodes, emptyTextNodes);

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
      snapshotElementNode(n);
      n.name = n.tag;
      const p = n.path.head;
      snapshotVarHead(p);
      const partRange = toFileRange(p.loc);
      n.parts = [
        {
          type: "GlimmerElementNodePart",
          original: p.original,
          name: p.original,
          parent: n,
          range: partRange,
          start: partRange[0],
          end: partRange[1],
          loc: toFileLoc(partRange),
        },
      ];
    }

    if ("blockParams" in n && Array.isArray(n.blockParams)) {
      if (n.params && n.params.length === n.blockParams.length) {
        n.blockParamNodes = n.params.map((p) => {
          snapshotVarHead(p);
          const range = toFileRange(p.loc);
          return {
            type: "GlimmerBlockParam",
            name: p.original || p.name,
            original: p.original,
            parent: n,
            range,
            start: range[0],
            end: range[1],
            loc: toFileLoc(range),
          };
        });
      } else {
        n.blockParamNodes = n.blockParams.map((name) => ({
          type: "GlimmerBlockParam",
          name,
          parent: n,
          range: [n.range[0], n.range[1]],
          start: n.range[0],
          end: n.range[1],
          loc: toFileLoc(n.range),
        }));
      }
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

    // Snapshot PathExpression.head getters (name/original)
    if (n.type === "GlimmerPathExpression" && n.head) snapshotVarHead(n.head);
  }

  removeFromParent(emptyTextNodes);
  removeFromParent(comments);
  for (const comment of comments) {
    comment.type = "Block";
  }

  ast.tokens = buildTokenStream(tokenize(templateContent, codeLines, offset), comments, textNodes);
  ast.contents = templateContent;

  return { ast, comments };
}
