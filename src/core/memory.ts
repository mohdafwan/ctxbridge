import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { loadConfig, type Config } from "./config.js";
import { openDb, encodeVector, decodeVector, type DbRow } from "./db.js";
import { makeEmbedder, cosine, tokenize, type Embedder } from "./embeddings.js";
import type {
  Memory,
  SaveMemoryInput,
  SearchOptions,
  SearchResult,
  MemoryType,
} from "./types.js";

const SEMANTIC_WEIGHT = 0.6;
const KEYWORD_WEIGHT = 0.4;

/**
 * The core memory engine. Owns storage, embedding, and hybrid retrieval.
 * One instance per process; safe to share across MCP tool calls.
 */
export class MemoryStore {
  private db: Database.Database;
  private embedder: Embedder;

  constructor(config: Config = loadConfig()) {
    this.db = openDb(config.dbPath);
    this.embedder = makeEmbedder(config);
  }

  async save(input: SaveMemoryInput): Promise<Memory> {
    const content = input.content.trim();
    if (!content) throw new Error("Cannot save an empty memory.");

    const now = Date.now();
    const mem: Memory = {
      id: randomUUID(),
      content,
      type: (input.type ?? "note") as MemoryType,
      tags: input.tags ?? [],
      source: input.source ?? "unknown",
      project: input.project ?? "global",
      createdAt: now,
      updatedAt: now,
    };

    const vec = await this.embedder.embed(content);
    this.db
      .prepare(
        `INSERT INTO memories
           (id, content, type, tags, source, project, embedding, embed_model, created_at, updated_at, deleted)
         VALUES (@id, @content, @type, @tags, @source, @project, @embedding, @embed_model, @created_at, @updated_at, 0)`,
      )
      .run({
        id: mem.id,
        content: mem.content,
        type: mem.type,
        tags: JSON.stringify(mem.tags),
        source: mem.source,
        project: mem.project,
        embedding: encodeVector(vec),
        embed_model: this.embedder.name,
        created_at: mem.createdAt,
        updated_at: mem.updatedAt,
      });

    return mem;
  }

  async search(query: string, opts: SearchOptions = {}): Promise<SearchResult[]> {
    const limit = opts.limit ?? 8;

    // Candidate set: all live memories in scope. Fine for MVP-scale corpora.
    const where: string[] = ["deleted = 0"];
    const params: Record<string, unknown> = {};
    if (opts.project) {
      where.push("(project = @project OR project = 'global')");
      params.project = opts.project;
    }
    if (opts.type) {
      where.push("type = @type");
      params.type = opts.type;
    }
    const rows = this.db
      .prepare(`SELECT rowid, * FROM memories WHERE ${where.join(" AND ")}`)
      .all(params) as (DbRow & { rowid: number })[];

    if (rows.length === 0) return [];

    // Empty query → most recent in scope.
    if (!query.trim()) {
      return rows
        .sort((a, b) => b.updated_at - a.updated_at)
        .slice(0, limit)
        .map((r) => ({ ...rowToMemory(r), score: 0 }));
    }

    // Semantic half.
    const qvec = await this.embedder.embed(query);
    const semantic = new Map<number, number>();
    for (const r of rows) {
      semantic.set(r.rowid, clamp01(cosine(qvec, decodeVector(r.embedding))));
    }

    // Keyword half (FTS5 + bm25). Lower bm25 is better; invert to [0,1].
    const keyword = this.keywordScores(query, rows.map((r) => r.rowid));

    const scored = rows.map((r) => {
      const sem = semantic.get(r.rowid) ?? 0;
      const kw = keyword.get(r.rowid) ?? 0;
      const score = SEMANTIC_WEIGHT * sem + KEYWORD_WEIGHT * kw;
      return { ...rowToMemory(r), score };
    });

    return scored
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  list(opts: { project?: string; limit?: number } = {}): Memory[] {
    const where: string[] = ["deleted = 0"];
    const params: Record<string, unknown> = {};
    if (opts.project) {
      where.push("project = @project");
      params.project = opts.project;
    }
    const rows = this.db
      .prepare(
        `SELECT * FROM memories WHERE ${where.join(" AND ")}
         ORDER BY updated_at DESC LIMIT @limit`,
      )
      .all({ ...params, limit: opts.limit ?? 50 }) as DbRow[];
    return rows.map(rowToMemory);
  }

  /** Soft-delete so the record can still sync a tombstone in Phase 2. */
  delete(id: string): boolean {
    const info = this.db
      .prepare(`UPDATE memories SET deleted = 1, updated_at = @now WHERE id = @id AND deleted = 0`)
      .run({ id, now: Date.now() });
    return info.changes > 0;
  }

  get(id: string): Memory | null {
    const row = this.db
      .prepare(`SELECT * FROM memories WHERE id = @id AND deleted = 0`)
      .get({ id }) as DbRow | undefined;
    return row ? rowToMemory(row) : null;
  }

  stats(): { total: number; byProject: Record<string, number>; embedder: string } {
    const total = (
      this.db.prepare(`SELECT COUNT(*) c FROM memories WHERE deleted = 0`).get() as { c: number }
    ).c;
    const rows = this.db
      .prepare(`SELECT project, COUNT(*) c FROM memories WHERE deleted = 0 GROUP BY project`)
      .all() as { project: string; c: number }[];
    const byProject: Record<string, number> = {};
    for (const r of rows) byProject[r.project] = r.c;
    return { total, byProject, embedder: this.embedder.name };
  }

  close(): void {
    this.db.close();
  }

  private keywordScores(query: string, rowids: number[]): Map<number, number> {
    const result = new Map<number, number>();
    const tokens = tokenize(query);
    if (tokens.length === 0) return result;

    // Build a safe FTS MATCH: OR of quoted tokens.
    const match = tokens.map((t) => `"${t}"`).join(" OR ");
    let hits: { rowid: number; rank: number }[];
    try {
      hits = this.db
        .prepare(
          `SELECT rowid, bm25(memories_fts) AS rank
             FROM memories_fts WHERE memories_fts MATCH @match`,
        )
        .all({ match }) as { rowid: number; rank: number }[];
    } catch {
      // Malformed FTS query (rare given sanitization) — degrade to semantic-only.
      return result;
    }

    const inScope = new Set(rowids);
    const ranks = hits.filter((h) => inScope.has(h.rowid));
    if (ranks.length === 0) return result;

    // bm25 is negative-ish; smaller = more relevant. Map to [0,1] within this result set.
    const values = ranks.map((h) => h.rank);
    const min = Math.min(...values);
    const max = Math.max(...values);
    for (const h of ranks) {
      const norm = max === min ? 1 : (max - h.rank) / (max - min);
      result.set(h.rowid, clamp01(norm));
    }
    return result;
  }
}

function rowToMemory(r: DbRow): Memory {
  return {
    id: r.id,
    content: r.content,
    type: r.type as MemoryType,
    tags: safeParseTags(r.tags),
    source: r.source,
    project: r.project,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function safeParseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
