/**
 * The Strategy:
 *
 * 1. parse out the <template>...</template> regions (content-tag)
 * 2. create placeholder JS for the template regions (same char length)
 * 3. parse as js/ts — default: oxc-parser, or a custom parser via options
 * 4. single zimmerframe walk: splice in processed Glimmer ASTs
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
 * @param {function} [options.parser] - Custom JS/TS parser: (jsCode, parserOptions) => { ast, scopeManager?, visitorKeys?, services?, ... }
 * @param {object}  [options.parserOptions] - Options forwarded to the custom parser
 * @return {object}
 */
export function toTree(source, options = {}) {
  if (options.templateOnly) {
    return toTemplateTree(source, options);
  }

  let parseResults = preprocessor.parse(source);
  let js = toPlaceholderJS(source, parseResults);

  // Parse the placeholder JS — use custom parser or default oxc
  let result;
  if (options.parser) {
    // Custom parser receives the source, parseResults, and placeholder JS.
    // It can use its own placeholder format (e.g., backtick expressions for TS)
    // or use the default TEMPLATE_TEMPLATE(...) format.
    result = options.parser(source, parseResults, js);
    // Normalize: ensure ast is at the top level
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

  const useCustomParser = !!options.parser;

  // If no templates, return early
  if (!parseResults.length) {
    if (useCustomParser) {
      result.visitorKeys = {
        ...(result.visitorKeys || {}),
        ...buildGlimmerVisitorKeys(),
      };
      return result;
    }
    return result.ast;
  }

  const codeLines = new DocumentLines(source);
  const allComments = [];
  const templateInfos = [];

  // Build a set of template ranges for fast lookup
  const templateRangeByStart = new Map(
    parseResults.map((r) => [r.range.startUtf16Codepoint, r]),
  );

  // Single zimmerframe walk: find placeholders, splice in Glimmer ASTs
  result.ast = walk(result.ast, null, {
    _(node, { next }) {
      // Match placeholders by node type (default oxc format) or by range (custom parser format)
      const isPlaceholder = useCustomParser
        ? templateRangeByStart.has(node.start) &&
          (node.type === "ExpressionStatement" ||
            node.type === "StaticBlock" ||
            node.type === "TemplateLiteral" ||
            node.type === "ExportDefaultDeclaration" ||
            isExpressionPlaceholder(node) ||
            isClassMemberPlaceholder(node))
        : isExpressionPlaceholder(node) || isClassMemberPlaceholder(node);

      if (isPlaceholder) {
        let range = node.range || [node.start, node.end];
        if (node.type === "ExportDefaultDeclaration" && node.declaration) {
          range = [node.declaration.start, node.declaration.end];
        }
        const parseResult = templateRangeByStart.get(range[0]);
        if (
          !parseResult ||
          (parseResult.range.endUtf16Codepoint !== range[1] &&
            parseResult.range.endUtf16Codepoint !== range[1] + 1)
        ) {
          next();
          return;
        }

        let templateContent = parseResult.contents;
        let contentRange = [
          parseResult.contentRange.startUtf16Codepoint,
          parseResult.contentRange.endUtf16Codepoint,
        ];
        let fullRange = [
          parseResult.range.startUtf16Codepoint,
          parseResult.range.endUtf16Codepoint,
        ];

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

        // When using a custom parser, we need to replace the node in-place
        // (the node is part of the parser's AST, not a zimmerframe copy)
        if (options.parser) {
          for (const key of Object.keys(node)) {
            if (!(key in ast) && key !== "parent") {
              delete node[key];
            }
          }
          Object.assign(node, ast);
          next();
          return;
        }

        return ast;
      }
      next();
    },
  });

  // Splice template tokens into the AST token stream
  const astRoot = result.ast.program || result.ast;
  if (astRoot.tokens) {
    for (const ti of templateInfos) {
      const firstIdx = astRoot.tokens.findIndex((t) => t.range[0] === ti.utf16Range[0]);
      const lastIdx = astRoot.tokens.findIndex((t) => t.range[1] === ti.utf16Range[1]);
      if (firstIdx >= 0 && lastIdx >= 0) {
        astRoot.tokens.splice(firstIdx, lastIdx - firstIdx + 1, ...ti.ast.tokens);
      }
    }
  }

  // Merge comments
  if (allComments.length) {
    if (!astRoot.comments) astRoot.comments = [];
    astRoot.comments.push(...allComments);
  }

  // Merge Glimmer visitor keys
  result.visitorKeys = {
    ...(result.visitorKeys || {}),
    ...buildGlimmerVisitorKeys(),
  };

  // Custom parser: return full result with templateInfos for scope registration
  if (useCustomParser) {
    result.templateInfos = templateInfos;
    return result;
  }

  // Default: return the AST directly (backward-compatible)
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

// ── Helpers ───────────────────────────────────────────────────────────

function isExpressionPlaceholder(node) {
  return node.type === "CallExpression" && node.callee?.name === "TEMPLATE_TEMPLATE";
}

function isClassMemberPlaceholder(node) {
  return (
    node.type === "PropertyDefinition" &&
    node.computed &&
    node.key?.type === "CallExpression" &&
    node.key.callee?.name === "_TEMPLATE_"
  );
}

/**
 * Replaces <template>...</template> regions with placeholder expressions
 * of the same character length that are valid JavaScript.
 *
 * Expression templates become:  TEMPLATE_TEMPLATE(`...`)
 * Class member templates become: [_TEMPLATE_(`...`)] = 0;
 *
 * Both use exactly 21 characters for wrappers, matching
 * <template> (10) + </template> (11) = 21 character overhead.
 */
export function toPlaceholderJS(source, parseResults) {
  let result = source;
  let offset = 0;

  for (let pr of parseResults) {
    let start = pr.range.startUtf16Codepoint;
    let end = pr.range.endUtf16Codepoint;

    let openingTag, closingTag;
    switch (pr.type) {
      case "expression":
        openingTag = "TEMPLATE_TEMPLATE(`";
        closingTag = "`)";
        break;
      case "class-member":
        openingTag = "[_TEMPLATE_(`";
        closingTag = "`)] = 0;";
        break;
    }

    let content = source.slice(
      pr.contentRange.startUtf16Codepoint,
      pr.contentRange.endUtf16Codepoint,
    );

    let replacement = openingTag + content + closingTag;

    result = result.slice(0, start + offset) + replacement + result.slice(end + offset);
    offset += replacement.length - (end - start);
  }

  return result;
}
