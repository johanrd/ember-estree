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
import templateRecast from 'ember-template-recast';
import { Transformer } from "content-tag-utils";

import { tsOptions } from "./options.js";

let p = new Preprocessor();
const SPACE = ' ';
const CLOSING = '</template>';
const CLOSING_LENGTH = CLOSING.length;

/**
 * @typedef {import('@babel/parser').ParseResult} Result
 *
 * @param {string} source
 * @param {object} options
 * @return {Result}
 */
export function toTree(source, options = {}) {
  let preprocessed = prepare(source);

  let outerAST = babelParser.parse(preprocessed, {
    ...tsOptions,
    ...options,
  });

  let ast = outerAST;

  return ast;
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
  let arraySource = Array.from(source);
  let t = new Transformer(source);

  console.log(t);

  const data = [];

  /**
   * The opening and closing <template> tags 
   * may not contain unicode (atm).
   */
  for (let { startRange, endRange } of t.parseResults) {
    for (let i = startRange.start; i<startRange.end; i++) {
      arraySource[i] = SPACE;
    }
    for (let i = endRange.start; i<endRange.end; i++) {
      arraySource[i] = SPACE;
    }
  }
  console.log(t);

  // TODO: add start/end tags to this callback
  t.each((contents, coordinates) => {
    let templateAST = templateRecast.parse(contents);

    data.push({
      ast: templateAST,
      contents,
      coordinates,
    });

    for (let i = coordinates.start; i < coordinates.end; i++) {
      arraySource[i] = SPACE;
    }
  });

  let code = arraySource.join('');

  return {
    code,
    data,
  }
}