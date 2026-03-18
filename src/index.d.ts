/**
 * Options accepted by `parse` and `toTree`.
 */
export interface ParseOptions {
  /** Path to the file being parsed, used to determine the language (js/ts). */
  filePath?: string;
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
 *
 * Mirrors the shape produced internally:
 * ```
 * { type: "File", program: Program, comments: Comment[], start, end }
 * ```
 */
export interface FileNode extends ASTNode {
  type: "File";
  program: ASTNode;
  comments: ASTNode[];
}

/**
 * Converts between character offsets and line/column positions within a
 * source string.
 */
export class DocumentLines {
  constructor(source: string);

  /** Converts a `{ line, column }` position to a character offset. */
  positionToOffset(pos: Position): number;

  /** Converts a character offset to a `{ line, column }` position. */
  offsetToPosition(offset: number): Position;
}

/**
 * Parse Ember .gjs/.gts source code and return a File-like ESTree-compatible
 * AST with embedded Glimmer template nodes.
 *
 * @param source  The raw source code of the file.
 * @param options Optional parse options.
 * @returns A `File`-shaped object with a `.program` property.
 */
export function toTree(source: string, options?: ParseOptions): FileNode;

/**
 * Parse Ember .gjs/.gts source code into an ESTree-compatible AST with
 * embedded Glimmer template nodes.
 *
 * @param source  The source code to parse.
 * @param options Optional parse options.
 * @returns The ESTree-compatible AST.
 */
export function parse(source: string, options?: ParseOptions): FileNode;

/**
 * Recursively print an AST node back to source code.
 *
 * Handles ESTree, TypeScript, and Glimmer template node types.
 * JSX nodes are not supported — Ember uses Glimmer templates instead.
 *
 * @param node The AST node to print.
 * @returns The printed source string.
 */
export function print(node: ASTNode): string;

/**
 * Build and return the Glimmer visitor keys map with a `"Glimmer"` prefix on
 * every key (e.g. `"GlimmerElementNode"`).
 *
 * The result is cached after the first call.
 *
 * @returns A map of Glimmer node type names to arrays of child-property names.
 */
export function buildGlimmerVisitorKeys(): Record<string, string[]>;

/**
 * Recursively remove all `parent` references from an AST.
 * Useful when you need to serialize the tree to JSON,
 * since parent back-references create circular structures.
 *
 * Mutates the tree in place and returns it.
 */
export function removeParentReferences(ast: ASTNode): ASTNode;

/**
 * Options for `processGlimmerTemplate`.
 */
export interface ProcessGlimmerTemplateOptions {
  /** The template string to parse (may include <template> tags for .gjs/.gts). */
  templateContent: string;
  /** DocumentLines for the full source file. */
  codeLines: DocumentLines;
  /** Range [start, end] for the Template root node in the full source. */
  templateRange: [number, number];
  /** Optional override string for tokenization (defaults to templateContent). */
  tokenSource?: string;
}

/**
 * Result of `processGlimmerTemplate`.
 */
export interface ProcessGlimmerTemplateResult {
  /** The transformed Glimmer AST with ESTree-compatible ranges/locs and tokens. */
  ast: ASTNode;
  /** Comment nodes extracted from the template. */
  comments: ASTNode[];
}

/**
 * Parse a Glimmer template string and produce a processed, ESTree-compatible AST.
 *
 * Handles parsing via `@glimmer/syntax`, range/loc fixing, type prefixing,
 * tokenization, and structural cleanup.
 */
export function processGlimmerTemplate(
  options: ProcessGlimmerTemplateOptions,
): ProcessGlimmerTemplateResult;

/**
 * Simple tokenizer for Glimmer templates. Splits into words and punctuators.
 *
 * @param template   The template string to tokenize.
 * @param doc        DocumentLines for the full source file.
 * @param startOffset  The byte offset where the template starts in the full source.
 * @returns Array of token objects.
 */
export function tokenize(template: string, doc: DocumentLines, startOffset: number): ASTNode[];

/**
 * Path object passed to `traverse` visitor callbacks.
 */
export interface TraversePath {
  node: ASTNode | null;
  parent: ASTNode | null;
  parentKey: string | null;
  parentPath: TraversePath | null;
  context: Record<string, unknown>;
}

/**
 * Traverse an ESTree+Glimmer AST. Merges the provided visitor keys
 * with Glimmer visitor keys for unified traversal.
 *
 * @param visitorKeys  ESTree visitor keys from the parser.
 * @param node         Root AST node.
 * @param visitor      Callback receiving a TraversePath for each node.
 */
export function traverse(
  visitorKeys: Record<string, string[]>,
  node: ASTNode,
  visitor: (path: TraversePath) => void,
): void;
