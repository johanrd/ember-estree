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

import { Preprocessor } from "content-tag";
import babelParser from "@babel/parser";

import { tsOptions } from "./options.js";

let p = new Preprocessor();

/**
 * @typedef {import('@babel/parser').ParseResult} Result
 *
 * @param {string} source
 * @param {object} options
 * @return {Result}
 */
export function toTree(source, options = {}) {
  return babelParser.parse(source, {
    ...tsOptions,
    ...options,
  });
}

//////////////////////////////////////////////////
//
// Helpers
//
//////////////////////////////////////////////////

/**
 * @param {string} source
 */
function prepare(source) {
  let templateInfo = p.parse(source);
}
