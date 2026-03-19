/**
 * Example ESLint custom parser for .gjs/.gts files using ember-estree.
 *
 * @see https://eslint.org/docs/latest/extend/custom-parsers
 */
import { toTree, glimmerVisitorKeys, DocumentLines } from "ember-estree";
import { analyze, Reference, Scope, Variable, Definition } from "eslint-scope";
import { isKeyword } from "@glimmer/syntax";

/**
 * Add `range` and `loc` to every AST node. ESLint requires both.
 */
function addRangesAndLocs(node, docLines, visited = new Set()) {
  if (!node || typeof node !== "object" || visited.has(node)) return;
  visited.add(node);

  if (node.type && typeof node.start === "number" && typeof node.end === "number") {
    if (!node.range) node.range = [node.start, node.end];
    if (!node.loc) {
      node.loc = {
        start: docLines.offsetToPosition(node.start),
        end: docLines.offsetToPosition(node.end),
      };
    }
  }

  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "parent" || key === "tokens" || key === "comments") continue;
    const val = node[key];
    if (Array.isArray(val)) {
      for (const item of val) addRangesAndLocs(item, docLines, visited);
    } else if (val && typeof val === "object") {
      addRangesAndLocs(val, docLines, visited);
    }
  }
}

// ── Scope helpers ──

function findVarInParentScopes(scopeManager, path, name) {
  let defScope = null;
  let currentScope = null;
  let p = path;
  while (p) {
    const s = scopeManager.acquire(p.node, true);
    if (s) {
      if (!currentScope) currentScope = s;
      if (s.set.has(name)) {
        defScope = s;
        break;
      }
    }
    p = p.parentPath;
  }
  if (!defScope) return { scope: currentScope };
  return { scope: currentScope, variable: defScope.set.get(name) };
}

function findParentScope(scopeManager, path) {
  let p = path;
  while (p) {
    const scope = scopeManager.acquire(p.node, true);
    if (scope) return scope;
    p = p.parentPath;
  }
  return null;
}

function registerNodeInScope(node, scope, variable) {
  const ref = new Reference(node, scope, Reference.READ);
  if (variable) {
    variable.references.push(ref);
    ref.resolved = variable;
  } else {
    let s = scope;
    while (s.upper) s = s.upper;
    s.through.push(ref);
  }
  scope.references.push(ref);
}

const EXCLUDED_KEYS = ["parent", "loc", "range", "tokens", "comments"];

function traverseAST(visitorKeys, node, visitor) {
  const queue = [{ node, parent: null, parentKey: null, parentPath: null }];
  while (queue.length > 0) {
    const currentPath = queue.pop();
    visitor(currentPath);
    if (!currentPath.node?.type) continue;
    let keys = visitorKeys[currentPath.node.type];
    if (!keys) keys = Object.keys(currentPath.node).filter((k) => !EXCLUDED_KEYS.includes(k));
    for (const key of keys) {
      const child = currentPath.node[key];
      if (!child) continue;
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item?.type)
            queue.push({
              node: item,
              parent: currentPath.node,
              parentKey: key,
              parentPath: currentPath,
            });
        }
      } else if (child.type) {
        queue.push({
          node: child,
          parent: currentPath.node,
          parentKey: key,
          parentPath: currentPath,
        });
      }
    }
  }
}

function registerGlimmerScopes(program, scopeManager, visitorKeys) {
  traverseAST(visitorKeys, program, (path) => {
    const node = path.node;
    if (!node) return;

    if (node.type === "GlimmerPathExpression" && node.head?.type === "VarHead") {
      if (isKeyword(node.head.name)) return;
      const { scope, variable } = findVarInParentScopes(scopeManager, path, node.head.name);
      if (scope) {
        node.head.parent = node;
        registerNodeInScope(node.head, scope, variable);
      }
    }

    if (node.type === "GlimmerElementNode" && node.parts?.[0]) {
      const name = node.parts[0].name;
      const ignore =
        name === "this" || name.startsWith(":") || name.startsWith("@") || name.includes("-");
      if (!ignore && /^[A-Z]/.test(name)) {
        const { scope, variable } = findVarInParentScopes(scopeManager, path, name);
        if (scope) registerNodeInScope(node.parts[0], scope, variable);
      }
    }

    if (node.blockParamNodes?.length > 0) {
      const upperScope = findParentScope(scopeManager, path);
      if (!upperScope) return;
      const scope = new Scope(scopeManager, "block", upperScope, node, false);
      for (const [i, param] of node.blockParamNodes.entries()) {
        const v = new Variable(param.name, scope);
        v.identifiers.push(param);
        scope.variables.push(v);
        scope.set.set(param.name, v);
        v.defs.push(new Definition("Parameter", param, node, node, i, "Block Param"));
      }
    }
  });
}

/**
 * Implements the ESLint `parseForESLint()` API.
 */
export function parseForESLint(code, options = {}) {
  const result = toTree(code, options);
  const program = result.program || result;
  const visitorKeys = result.visitorKeys || glimmerVisitorKeys;

  const docLines = new DocumentLines(code);
  addRangesAndLocs(program, docLines);

  program.tokens = (program.tokens || []).map((t) => ({
    ...t,
    range: t.range || [t.start, t.end],
    type: typeof t.type === "string" ? t.type : t.type?.label || "Punctuator",
  }));
  program.comments = (program.comments || []).map((c) => ({
    ...c,
    range: c.range || [c.start, c.end],
  }));
  program.range = program.range || [program.start, program.end];
  program.loc = program.loc || {
    start: { line: 1, column: 0 },
    end: docLines.offsetToPosition(code.length),
  };

  const scopeManager = analyze(program, {
    ecmaVersion: 2024,
    sourceType: "module",
    childVisitorKeys: visitorKeys,
    fallback: (node) => Object.keys(node).filter((k) => !EXCLUDED_KEYS.includes(k)),
  });

  registerGlimmerScopes(program, scopeManager, visitorKeys);

  return { ast: program, visitorKeys, scopeManager };
}

export default {
  meta: { name: "ember-estree-eslint-parser-example", version: "0.0.0" },
  parseForESLint,
};
