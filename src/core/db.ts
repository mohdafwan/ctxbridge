import Database from "better-sqlite3";

export interface DbRow {
  id: string;
  content: string;
  type: string;
  tags: string; // JSON array
  source: string;
  project: string;
  embedding: Buffer; // Float32 little-endian
  embed_model: string;
  created_at: number;
  updated_at: number;
  deleted: number;
}

/**
 * Open (and migrate) the SQLite database that backs the memory store.
 * WAL mode keeps reads fast while an MCP server writes concurrently.
 */
export function openDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  migrate(db);
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id          TEXT PRIMARY KEY,
      content     TEXT NOT NULL,
      type        TEXT NOT NULL DEFAULT 'note',
      tags        TEXT NOT NULL DEFAULT '[]',
      source      TEXT NOT NULL DEFAULT 'unknown',
      project     TEXT NOT NULL DEFAULT 'global',
      embedding   BLOB NOT NULL,
      embed_model TEXT NOT NULL DEFAULT '',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      deleted     INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project);
    CREATE INDEX IF NOT EXISTS idx_memories_deleted ON memories(deleted);

    -- Full-text index for the keyword half of hybrid search.
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content,
      tags,
      content='memories',
      content_rowid='rowid'
    );

    -- Keep the FTS index in sync with the base table via triggers.
    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, content, tags) VALUES (new.rowid, new.content, new.tags);
    END;
    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, tags) VALUES ('delete', old.rowid, old.content, old.tags);
    END;
    CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, tags) VALUES ('delete', old.rowid, old.content, old.tags);
      INSERT INTO memories_fts(rowid, content, tags) VALUES (new.rowid, new.content, new.tags);
    END;
  `);
}

/** Serialize a Float32Array to a Buffer for BLOB storage. */
export function encodeVector(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

/** Read a stored BLOB back into a Float32Array. */
export function decodeVector(buf: Buffer): Float32Array {
  // Copy into an aligned ArrayBuffer; sqlite buffers aren't guaranteed aligned.
  const copy = new Uint8Array(buf.byteLength);
  copy.set(buf);
  return new Float32Array(copy.buffer, 0, buf.byteLength / 4);
}
