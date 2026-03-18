/**
 * Options accepted by `parse` and `toTree`.
 */
export interface ParseOptions {
  /** Path to the file being parsed, used to determine the language (js/ts). */
  filePath?: string;
  /** Parse as raw Glimmer template content (for .hbs files). */
  templateOnly?: boolean;
  /** Position offset [start, end] for templateOnly mode. */
  templateRange?: [number, number];
  /** DocumentLines for position mapping in templateOnly mode. */
  codeLines?: DocumentLines;
}

/**
 * A 1-based line / 0-based column position, matching ESTree and Glimmer
 * conventions.
 */
export interface Position {
  line: number;
  column: number;
}

/**
 * Minimal shape shared by every AST node (ESTree, TypeScript, and Glimmer).
 */
export interface ASTNode {
  type: string;
  start?: number;
  end?: number;
  [key: string]: unknown;
}

/**
 * The `File`-like wrapper returned by `toTree` and `parse`.
 */
export interface FileNode extends ASTNode {
  type: "File";
  program: ASTNode;
  comments: ASTNode[];
}

/**
 * Result of `toTree` in templateOnly mode.
 */
export interface TemplateResult {
  ast: ASTNode;
  comments: ASTNode[];
}

/**
 * Converts between character offsets and line/column positions within a
 * source string.
 */
export class DocumentLines {
  constructor(source: string);
  positionToOffset(pos: Position): number;
  offsetToPosition(offset: number): Position;
}

/**
 * Parse Ember .gjs/.gts source code and return an ESTree-compatible AST.
 *
 * With `templateOnly: true`, parses raw Glimmer template content and
 * returns `{ ast, comments }`.
 */
export function toTree(source: string, options?: ParseOptions): FileNode | TemplateResult;

/**
 * Alias for `toTree`.
 */
export function parse(source: string, options?: ParseOptions): FileNode | TemplateResult;

/**
 * Recursively print an AST node back to source code.
 */
export function print(node: ASTNode): string;

/**
 * Build and return the Glimmer visitor keys map with a `"Glimmer"` prefix.
 * Result is cached after the first call.
 */
export function buildGlimmerVisitorKeys(): Record<string, string[]>;

/**
 * Recursively remove all `parent` references from an AST.
 * Mutates the tree in place and returns it.
 */
export function removeParentReferences(ast: ASTNode): ASTNode;
