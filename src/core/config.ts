import os from "node:os";
import path from "node:path";
import fs from "node:fs";

export interface Config {
  dbPath: string;
  embedder: "local" | "openai";
  openaiApiKey?: string;
  openaiEmbedModel: string;
}

/**
 * Resolve runtime config from environment, with safe zero-config defaults.
 * The local SQLite DB is the source of truth (local-first); cloud sync is layered on later.
 */
export function loadConfig(): Config {
  const home = os.homedir();
  const defaultDir = path.join(home, ".ctxbridge");
  const dbPath = process.env.CTXBRIDGE_DB ?? path.join(defaultDir, "ctxbridge.db");

  // Make sure the parent directory exists so the DB can be created.
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const embedder = process.env.CTXBRIDGE_EMBEDDER === "openai" ? "openai" : "local";

  return {
    dbPath,
    embedder,
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiEmbedModel: process.env.CTXBRIDGE_OPENAI_EMBED_MODEL ?? "text-embedding-3-small",
  };
}
