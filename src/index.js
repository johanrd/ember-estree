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

import babelParser from "@babel/parser";
import templateRecast from "ember-template-recast";
import { Transformer } from "content-tag-utils";
import { walk } from "estree-walker";

import { tsOptions } from "./options.js";
export { print } from "./print.js";

/**
 * @typedef {import('@babel/parser').ParseResult} Result
 *
 * @param {string} source
 * @param {object} options
 * @return {Result}
 */
export function toTree(source, options = {}) {
  let t = new Transformer(source);
  let js = t.toString({ placeholders: true });

  let outerAST = babelParser.parse(js, {
    ...tsOptions,
    ...options,
  });

  let parseResults = t.parseResults;

  walk(outerAST, {
    enter(node) {
      if (isExpressionPlaceholder(node)) {
        let parseResult = parseResults.find((r) => {
          // WARNING: these are byte ranges
          return node.start === r.range.start && node.end === r.range.end;
        });

        let content = t.stringUtils.originalContentOf(parseResult);
        let templateAST = templateRecast.parse(content);

        let templateESTree = toTemplateESTree(templateAST);

        this.replace(templateESTree);
      }
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

function toTemplateESTree(templateAST) {
  return templateAST;
}
