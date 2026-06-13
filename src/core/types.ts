export type MemoryType =
  | "note"
  | "fact"
  | "preference"
  | "project"
  | "decision"
  | "snippet";

export interface Memory {
  id: string;
  content: string;
  type: MemoryType;
  tags: string[];
  /** Which agent/CLI/surface created it, e.g. "claude-code", "codex", "web". */
  source: string;
  /** Project / workspace scope, usually a repo path or slug. "global" if unscoped. */
  project: string;
  createdAt: number;
  updatedAt: number;
}

export interface SaveMemoryInput {
  content: string;
  type?: MemoryType;
  tags?: string[];
  source?: string;
  project?: string;
}

export interface SearchOptions {
  limit?: number;
  /** Restrict to a project scope (plus globals). Omit to search everything. */
  project?: string;
  type?: MemoryType;
}

export interface SearchResult extends Memory {
  /** Combined relevance score in [0, 1]. */
  score: number;
}
