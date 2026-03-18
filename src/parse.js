/**
 * The Strategy:
 *
 * 1. parse out the <template>...</template> regions
 * 2. create a placeholder JS string for the template regions
 * 3. parse as js/ts to generate an ESTree
 * 4. single zimmerframe walk: splice in processed Glimmer ASTs
 * 5. Done
 */

import { parseSync } from "oxc-parser";
import { Preprocessor } from "content-tag";
import { walk } from "zimmerframe";

import { _processTemplate, DocumentLines } from "./transforms.js";

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
 * @return {object}
 */
export function toTree(source, options = {}) {
  if (options.templateOnly) {
    return toTemplateTree(source, options);
  }

  let parseResults = preprocessor.parse(source);
  let js = toPlaceholderJS(source, parseResults);

  let filename = options.filePath || "input.ts";
  let oxcResult = parseSync(filename, js);

  let outerAST = {
    type: "File",
    program: oxcResult.program,
    comments: oxcResult.comments || [],
    start: oxcResult.program.start,
    end: oxcResult.program.end,
  };

  const codeLines = new DocumentLines(source);

  outerAST = walk(outerAST, null, {
    _(node, { next }) {
      if (isExpressionPlaceholder(node) || isClassMemberPlaceholder(node)) {
        let parseResult = parseResults.find((r) => {
          return (
            node.start === r.range.startUtf16Codepoint && node.end === r.range.endUtf16Codepoint
          );
        });

        let templateContent = parseResult.contents;
        let contentRange = [
          parseResult.contentRange.startUtf16Codepoint,
          parseResult.contentRange.endUtf16Codepoint,
        ];
        let fullRange = [
          parseResult.range.startUtf16Codepoint,
          parseResult.range.endUtf16Codepoint,
        ];

        const { ast } = _processTemplate(templateContent, codeLines, contentRange);

        // Fix the Template root to cover the full <template>...</template> range
        ast.range = fullRange;
        ast.start = fullRange[0];
        ast.end = fullRange[1];
        ast.loc = {
          start: codeLines.offsetToPosition(fullRange[0]),
          end: codeLines.offsetToPosition(fullRange[1]),
        };

        return ast;
      }
      next();
    },
  });

  return outerAST;
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
  if (node.type !== "CallExpression") return;
  return node.callee.name === "TEMPLATE_TEMPLATE";
}

function isClassMemberPlaceholder(node) {
  if (node.type !== "PropertyDefinition") return;
  return (
    node.computed && node.key?.type === "CallExpression" && node.key.callee?.name === "_TEMPLATE_"
  );
}

function toPlaceholderJS(source, parseResults) {
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
