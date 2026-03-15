/**
 * The Strategy:
 *
 * 1. parse out the <template>...</template> regions
 *    - we haven't shipped "content-tag" through TC39, so for now, gjs and gts are invalid JavaScript
 *
 * 2. create a new string/contents of the file with a placeholder for the template regisions
 *    - this will be used later to splice in the Template AST Nodes
 *    - the placeholder should be the same dimensions as the template region
 *
 * 3. parse the string/contents as js/ts to generate an ESTree
 *
 * 4. parse each template region to generate an AST from that
 *
 * 5. convert the AST from `@glimmer/syntax` to ESTree
 *    - NOTE: it may already be ESTree
 *
 * 6. splice in the template ESTrees into the JS/TS ESTree
 *
 * 7. Done
 */

/**
 * Docs for dependencies:
 * - https://github.com/embroider-build/content-tag/
 */

import { parseSync } from "oxc-parser";
import templateRecast from "ember-template-recast";
import { Transformer } from "content-tag-utils";
import { walk } from "zimmerframe";

import { processGlimmerTemplate } from "./transforms.js";

/**
 * @param {string} source
 * @param {object} options
 * @return {object} A File-like AST with a `.program` property
 */
export function toTree(source, options = {}) {
  let t = new Transformer(source);
  let js = t.toString({ placeholders: true });

  let filename = options.filePath || "input.ts";
  let oxcResult = parseSync(filename, js);

  // Wrap in a File-like node to match the expected structure
  let outerAST = {
    type: "File",
    program: oxcResult.program,
    comments: oxcResult.comments || [],
    start: oxcResult.program.start,
    end: oxcResult.program.end,
  };

  let parseResults = t.parseResults;

  // oxc-parser reports character offsets (UTF-16 code units), while
  // content-tag-utils reports byte offsets (UTF-8). Build two converters:
  // one for `js` (to match placeholder nodes) and one for `source` (to
  // compute correct start/end/loc on the final AST nodes).
  // Both buffers are created once here; neither string is mutated after
  // this point so they remain valid for the lifetime of this call.
  let jsBuf = Buffer.from(js, "utf8");
  function byteToChar(byteOffset) {
    return jsBuf.subarray(0, byteOffset).toString("utf8").length;
  }

  let sourceBuf = Buffer.from(source, "utf8");
  function sourceByteToChar(byteOffset) {
    return sourceBuf.subarray(0, byteOffset).toString("utf8").length;
  }

  outerAST = walk(outerAST, null, {
    _(node, { next }) {
      if (isExpressionPlaceholder(node) || isClassMemberPlaceholder(node)) {
        let parseResult = parseResults.find((r) => {
          return node.start === byteToChar(r.range.start) && node.end === byteToChar(r.range.end);
        });

        let content = t.stringUtils.originalContentOf(parseResult);
        let templateAST = templateRecast.parse(content);

        let contentOffset = sourceByteToChar(parseResult.contentRange.start);
        let templateRange = [
          sourceByteToChar(parseResult.range.start),
          sourceByteToChar(parseResult.range.end),
        ];

        return processGlimmerTemplate(templateAST, {
          contentOffset,
          templateRange,
          source,
        });
      }
      next();
    },
  });

  let ast = outerAST;

  return ast;
}

/**
 * Parse Ember .gjs/.gts source code into an ESTree-compatible AST
 * with embedded Glimmer template nodes.
 *
 * @param {string} source - The source code to parse
 * @param {object} [options] - Parse options
 * @return {object} The ESTree-compatible AST
 */
export function parse(source, options = {}) {
  let ast = toTree(source, options);

  return ast;
}

//////////////////////////////////////////////////
//
// Helpers
//
//////////////////////////////////////////////////

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
