/**
 * Example ESLint custom parser for .gjs/.gts files using ember-estree.
 *
 * This demonstrates how to implement an ESLint parser plugin using
 * ember-estree's parse() and the Glimmer visitor keys, following the
 * pattern from ember-eslint-parser.
 *
 * @see https://eslint.org/docs/latest/extend/custom-parsers
 * @see https://github.com/ember-tooling/ember-eslint-parser
 */
import { parse, buildGlimmerVisitorKeys } from "ember-estree";

/**
 * Merge the Glimmer-prefixed visitor keys with a base set.
 * In a full implementation, you'd merge with @typescript-eslint/visitor-keys
 * or the babel parser's visitor keys.
 */
function mergeVisitorKeys() {
  return {
    ...buildGlimmerVisitorKeys(),
  };
}

/**
 * Implements the ESLint `parseForESLint()` API.
 *
 * @param {string} code - The source code to parse
 * @param {object} options - ESLint parser options
 * @returns {{ ast: object, visitorKeys: object, scopeManager: null }}
 */
export function parseForESLint(code, options = {}) {
  const ast = parse(code, options);

  // The AST from ember-estree is a Babel File node.
  // ESLint expects a Program node as the root.
  const program = ast.program;

  // Ensure required ESLint properties exist
  program.tokens = program.tokens || ast.tokens || [];
  program.comments = program.comments || ast.comments || [];
  program.range = program.range || [program.start, program.end];
  program.loc = program.loc || {
    start: { line: 1, column: 0 },
    end: { line: 1, column: 0 },
  };

  const visitorKeys = mergeVisitorKeys();

  return {
    ast: program,
    visitorKeys,
    // In a full implementation, you'd build a scopeManager
    // to enable no-undef / no-unused-vars for template expressions.
    // See ember-eslint-parser's convertAst() for scope tracking.
    scopeManager: null,
  };
}

export default {
  meta: {
    name: "ember-estree-eslint-parser-example",
    version: "0.0.0",
  },
  parseForESLint,
};
