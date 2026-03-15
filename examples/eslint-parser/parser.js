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
 * Recursively add `range: [start, end]` to every AST node that has
 * `start`/`end` but no `range`. ESLint requires range arrays on all nodes.
 */
function addRanges(node, visited = new Set()) {
  if (!node || typeof node !== "object" || visited.has(node)) return;
  visited.add(node);

  if (node.type && typeof node.start === "number" && typeof node.end === "number" && !node.range) {
    node.range = [node.start, node.end];
  }

  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "parent" || key === "tokens" || key === "comments") continue;
    const val = node[key];
    if (Array.isArray(val)) {
      for (const item of val) addRanges(item, visited);
    } else if (val && typeof val === "object") {
      addRanges(val, visited);
    }
  }
}

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

  // ESLint requires `range: [start, end]` on all AST nodes.
  // Babel only sets `start`/`end`. Walk the tree to add ranges.
  addRanges(program);

  // Ensure required ESLint properties exist
  program.tokens = (program.tokens || ast.tokens || []).map((t) => ({
    ...t,
    // ESLint requires range arrays on tokens
    range: t.range || [t.start, t.end],
    // ESLint expects token.type to be a string, not an object
    type: typeof t.type === "string" ? t.type : t.type?.label || "Punctuator",
  }));
  program.comments = (program.comments || ast.comments || []).map((c) => ({
    ...c,
    range: c.range || [c.start, c.end],
  }));
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
