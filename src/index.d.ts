export interface Position {
  line: number;
  column: number;
}

export interface ASTNode {
  type: string;
  start?: number;
  end?: number;
  [key: string]: unknown;
}

export interface FileNode extends ASTNode {
  type: "File";
  program: ASTNode;
  comments: ASTNode[];
}

export interface TemplateResult {
  ast: ASTNode;
  comments: ASTNode[];
}

export interface VisitorPath {
  node: ASTNode;
  parent: ASTNode | null;
  parentPath: VisitorPath | null;
}

export interface ParseOptions {
  filePath?: string;
  templateOnly?: boolean;
  /**
   * Include `parent` references on Glimmer AST nodes.
   * Defaults to `true`. Set to `false` for JSON-serializable output.
   */
  includeParentLinks?: boolean;
  /**
   * Custom JS/TS parser. Called with the placeholder JS string
   * (templates replaced with backtick expressions of equal length).
   * Must return at least `{ ast }`.
   */
  parser?: (placeholderJS: string) => { ast: ASTNode; [key: string]: unknown };
  /**
   * Callbacks invoked for Glimmer nodes during the AST splice traversal.
   * Runs in DFS order, so parent nodes are visited before children.
   */
  visitors?: {
    [glimmerNodeType: string]: (node: ASTNode, path: VisitorPath) => void;
    GlimmerBlockParams?: (node: ASTNode, path: VisitorPath) => void;
  };
}

export class DocumentLines {
  constructor(source: string);
  positionToOffset(pos: Position): number;
  offsetToPosition(offset: number): Position;
}

export function toTree(source: string, options?: ParseOptions): FileNode | TemplateResult;
export function parse(source: string, options?: ParseOptions): FileNode | TemplateResult;
export function print(node: ASTNode): string;

export const glimmerVisitorKeys: Record<string, string[]>;
