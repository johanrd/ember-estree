/**
 * The Strategy:
 *
 * 1. parse out the <template>...</template> regions (content-tag)
 * 2. create placeholder JS for the template regions (backtick/static-block, same char length)
 * 3. parse as js/ts — default: oxc-parser, or a custom parser via options
 * 4. splice in processed Glimmer ASTs, invoking visitors during traversal
 * 5. Merge Glimmer visitor keys into the result
 * 6. Done
 */

import { parseSync } from "oxc-parser";
import { Preprocessor } from "content-tag";
import { walk } from "zimmerframe";

import { _processTemplate, DocumentLines, buildGlimmerVisitorKeys } from "./transforms.js";

const preprocessor = new Preprocessor();

/**
 * Parse Ember source and return an ESTree-compatible AST.
 *
 * @param {string} source
 * @param {object} [options]
 * @param {string}  [options.filePath] - File path for language detection
 * @param {boolean} [options.templateOnly] - Parse as raw Glimmer template content (for .hbs)
 * @param {[number, number]} [options.templateRange] - Position offset for templateOnly mode
 * @param {import("./transforms.js").DocumentLines} [options.codeLines] - DocumentLines for position mapping
 * @param {function} [options.parser] - Custom JS/TS parser: (source, parseResults, placeholderJS) => { ast, scopeManager?, visitorKeys?, services?, ... }
 * @param {object}  [options.visitors] - Callbacks invoked for Glimmer nodes during traversal
 * @return {object}
 */
export function toTree(source, options = {}) {
  if (options.templateOnly) {
    return toTemplateTree(source, options);
  }

  let parseResults = preprocessor.parse(source);
  let js = toPlaceholderJS(source, parseResults);

  const useCustomParser = !!options.parser;
  const visitors = options.visitors || null;

  // Parse the placeholder JS — use custom parser or default oxc
  let result;
  if (useCustomParser) {
    result = options.parser(source, parseResults, js);
    if (!result.ast) {
      result = { ast: result };
    }
  } else {
    let filename = options.filePath || "input.ts";
    let oxcResult = parseSync(filename, js);
    result = {
      ast: {
        type: "File",
        program: oxcResult.program,
        comments: oxcResult.comments || [],
        start: oxcResult.program.start,
        end: oxcResult.program.end,
      },
    };
  }

  // If no templates, return early
  if (!parseResults.length) {
    if (useCustomParser) {
      result.visitorKeys = {
        ...result.visitorKeys,
        ...buildGlimmerVisitorKeys(),
      };
      return result;
    }
    return result.ast;
  }

  const codeLines = new DocumentLines(source);
  const allComments = [];
  const templateInfos = [];
  const glimmerKeys = buildGlimmerVisitorKeys();

  // Build a map of template ranges for lookup
  const templateRangeByStart = new Map(parseResults.map((r) => [r.range.startUtf16Codepoint, r]));

  // Process a matched placeholder node: create Glimmer AST and tokens
  function processPlaceholder(parseResult) {
    let templateContent = parseResult.contents;
    let contentRange = [
      parseResult.contentRange.startUtf16Codepoint,
      parseResult.contentRange.endUtf16Codepoint,
    ];
    let fullRange = [parseResult.range.startUtf16Codepoint, parseResult.range.endUtf16Codepoint];

    const { ast, comments } = _processTemplate(templateContent, codeLines, contentRange);

    // Fix the Template root to cover the full <template>...</template> range
    ast.range = fullRange;
    ast.start = fullRange[0];
    ast.end = fullRange[1];
    ast.loc = {
      start: codeLines.offsetToPosition(fullRange[0]),
      end: codeLines.offsetToPosition(fullRange[1]),
    };

    // Add tokens for the <template> and </template> tags
    const openEnd = contentRange[0];
    const closeStart = contentRange[1];
    const openTag = source.slice(fullRange[0], openEnd);
    const closeTag = source.slice(closeStart, fullRange[1]);
    const makeToken = (value, range) => ({
      type: "Punctuator",
      value,
      range,
      start: range[0],
      end: range[1],
      loc: {
        start: codeLines.offsetToPosition(range[0]),
        end: codeLines.offsetToPosition(range[1]),
      },
    });
    ast.tokens = [
      makeToken(openTag, [fullRange[0], openEnd]),
      ...(ast.tokens || []),
      makeToken(closeTag, [closeStart, fullRange[1]]),
    ];

    allComments.push(...comments);
    templateInfos.push({ utf16Range: fullRange, ast });
    return ast;
  }

  // Check if a node matches a template range
  function matchPlaceholder(node) {
    let range = node.range || [node.start, node.end];
    if (node.type === "ExportDefaultDeclaration" && node.declaration) {
      const decl = node.declaration;
      range = decl.range || [decl.start, decl.end];
    }
    const parseResult = templateRangeByStart.get(range[0]);
    if (
      !parseResult ||
      (parseResult.range.endUtf16Codepoint !== range[1] &&
        parseResult.range.endUtf16Codepoint !== range[1] + 1)
    ) {
      return null;
    }
    return parseResult;
  }

  // Invoke visitors for Glimmer nodes during traversal
  function visitGlimmerNode(node, path) {
    if (!visitors || !node.type || !node.type.startsWith("Glimmer")) return;
    const handler = visitors[node.type];
    if (handler) handler(node, path);
    if ("blockParams" in node && visitors.GlimmerBlockParams) {
      visitors.GlimmerBlockParams(node, path);
    }
  }

  // Walk Glimmer subtree, invoking visitors with full path context
  function walkGlimmerTree(node, parentPath) {
    if (!node || typeof node !== "object" || !node.type) return;
    const path = { node, parent: parentPath?.node ?? null, parentPath };
    visitGlimmerNode(node, path);

    const keys = glimmerKeys[node.type];
    if (!keys) return;
    for (const key of keys) {
      const child = node[key];
      if (!child) continue;
      if (Array.isArray(child)) {
        for (const item of child) {
          walkGlimmerTree(item, path);
        }
      } else if (typeof child === "object" && child.type) {
        walkGlimmerTree(child, path);
      }
    }
  }

  // Placeholder node types (backtick/static-block format)
  const placeholderTypes = new Set([
    "ExpressionStatement",
    "StaticBlock",
    "TemplateLiteral",
    "ExportDefaultDeclaration",
  ]);

  if (useCustomParser) {
    // Custom parser path: mutate the parser's AST in-place, invoke visitors.
    // Use the parser's visitorKeys to traverse efficiently (avoids Object.keys).
    const parserVisitorKeys = result.visitorKeys || {};

    function visitNode(node, parentPath) {
      if (!node || typeof node !== "object" || !node.type) return;

      const path = { node, parent: parentPath?.node ?? null, parentPath };

      if (placeholderTypes.has(node.type)) {
        const parseResult = matchPlaceholder(node);
        if (parseResult) {
          const ast = processPlaceholder(parseResult);
          for (const key of Object.keys(node)) {
            if (!(key in ast) && key !== "parent") {
              delete node[key];
            }
          }
          Object.assign(node, ast);
          if (visitors) walkGlimmerTree(node, parentPath);
          return;
        }
      }

      // Use visitorKeys for efficient child traversal
      const keys = parserVisitorKeys[node.type];
      if (!keys) return;
      for (const key of keys) {
        const child = node[key];
        if (!child) continue;
        if (Array.isArray(child)) {
          for (const item of child) {
            if (item && typeof item === "object" && item.type) {
              visitNode(item, path);
            }
          }
        } else if (typeof child === "object" && child.type) {
          visitNode(child, path);
        }
      }
    }

    visitNode(result.ast, null);
  } else {
    // Default oxc path: use zimmerframe walk (returns new tree)
    result.ast = walk(result.ast, null, {
      _(node, { next }) {
        if (placeholderTypes.has(node.type)) {
          const parseResult = matchPlaceholder(node);
          if (parseResult) {
            return processPlaceholder(parseResult);
          }
        }
        next();
      },
    });

    // Walk Glimmer subtrees for visitors (after zimmerframe splicing)
    if (visitors) {
      for (const ti of templateInfos) {
        walkGlimmerTree(ti.ast, null);
      }
    }
  }

  // Splice template tokens into the AST token stream.
  // Replace all tokens that fall within each template's range.
  const astRoot = result.ast.program || result.ast;
  if (astRoot.tokens) {
    for (const ti of templateInfos) {
      const [tStart, tEnd] = ti.utf16Range;
      const firstIdx = astRoot.tokens.findIndex((t) => t.range[0] >= tStart && t.range[0] < tEnd);
      if (firstIdx < 0) continue;
      let lastIdx = firstIdx;
      while (lastIdx < astRoot.tokens.length && astRoot.tokens[lastIdx].range[1] <= tEnd) {
        lastIdx++;
      }
      astRoot.tokens.splice(firstIdx, lastIdx - firstIdx, ...ti.ast.tokens);
    }
  }

  // Merge comments
  if (allComments.length) {
    if (!astRoot.comments) astRoot.comments = [];
    astRoot.comments.push(...allComments);
  }

  // Merge Glimmer visitor keys
  result.visitorKeys = {
    ...result.visitorKeys,
    ...glimmerKeys,
  };

  if (useCustomParser) {
    result.templateInfos = templateInfos;
    return result;
  }

  return result.ast;
}

/**
 * @param {string} source
 * @param {object} [options]
 * @return {object}
 */
export function parse(source, options = {}) {
  return toTree(source, options);
}

// ── templateOnly mode ─────────────────────────────────────────────────

function toTemplateTree(source, options) {
  const codeLines = options.codeLines || new DocumentLines(source);
  const templateRange = options.templateRange || [0, source.length];

  const { ast, comments } = _processTemplate(source, codeLines, templateRange);
  return { ast, comments };
}

// ── Placeholder JS ────────────────────────────────────────────────────

/**
 * Replaces <template>...</template> regions with placeholder expressions
 * of the same character length that are valid JS/TS.
 *
 * Expression templates become:  `content          ` (backtick, space-padded)
 * Class member templates become: static{`content  `} (static block, space-padded)
 *
 * This format is compatible with all JS/TS parsers including
 * oxc-parser, @typescript-eslint/parser, and @babel/eslint-parser.
 */
export function toPlaceholderJS(source, parseResults) {
  // Build result in forward order using parts array (avoids intermediate string allocations)
  const parts = [];
  let cursor = 0;

  for (const pr of parseResults) {
    const start = pr.range.startUtf16Codepoint;
    const end = pr.range.endUtf16Codepoint;
    const tplLength = end - start;

    parts.push(source.slice(cursor, start));

    const content = source
      .slice(pr.contentRange.startUtf16Codepoint, pr.contentRange.endUtf16Codepoint)
      .replace(/`/g, "\\`")
      .replace(/\$/g, "\\$");

    if (pr.type === "class-member") {
      const spaces = tplLength - content.length - 10; // "static{`" + "`}" = 10
      parts.push(`static{\`${content}${" ".repeat(Math.max(0, spaces))}\`}`);
    } else {
      const spaces = tplLength - content.length - 2; // "`" + "`" = 2
      parts.push(`\`${content}${" ".repeat(Math.max(0, spaces))}\``);
    }

    cursor = end;
  }

  parts.push(source.slice(cursor));
  return parts.join("");
}
