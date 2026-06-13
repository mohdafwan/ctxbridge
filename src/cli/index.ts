#!/usr/bin/env node
import { MemoryStore } from "../core/memory.js";
import type { MemoryType } from "../core/types.js";

const HELP = `ctxbridge — cross-agent memory layer

Usage:
  ctxbridge add <content> [--type <t>] [--tags a,b,c] [--project <p>]
  ctxbridge search <query> [--project <p>] [--type <t>] [--limit <n>]
  ctxbridge list [--project <p>] [--limit <n>]
  ctxbridge delete <id>
  ctxbridge stats
  ctxbridge help

Types: note | fact | preference | project | decision | snippet

The store lives at ~/.ctxbridge/ctxbridge.db by default (override with CTXBRIDGE_DB).
The same store is served to your CLIs via the ctxbridge MCP server (ctxbridge-mcp).
`;

interface Flags {
  positional: string[];
  type?: string;
  tags?: string;
  project?: string;
  limit?: string;
}

function parseArgs(argv: string[]): Flags {
  const flags: Flags = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--type") flags.type = argv[++i];
    else if (a === "--tags") flags.tags = argv[++i];
    else if (a === "--project") flags.project = argv[++i];
    else if (a === "--limit") flags.limit = argv[++i];
    else flags.positional.push(a);
  }
  return flags;
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseArgs(rest);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(HELP);
    return;
  }

  const store = new MemoryStore();
  try {
    switch (command) {
      case "add": {
        const content = flags.positional.join(" ").trim();
        if (!content) throw new Error('Nothing to add. Usage: ctxbridge add "your memory"');
        const mem = await store.save({
          content,
          type: flags.type as MemoryType | undefined,
          tags: flags.tags?.split(",").map((t) => t.trim()).filter(Boolean),
          project: flags.project,
          source: "cli",
        });
        console.log(`Saved ${mem.id} (type=${mem.type}, project=${mem.project}).`);
        break;
      }
      case "search": {
        const query = flags.positional.join(" ").trim();
        const results = await store.search(query, {
          project: flags.project,
          type: flags.type as MemoryType | undefined,
          limit: flags.limit ? parseInt(flags.limit, 10) : undefined,
        });
        if (results.length === 0) {
          console.log("No relevant memories found.");
          break;
        }
        for (const [i, r] of results.entries()) {
          console.log(
            `${i + 1}. [${r.score.toFixed(2)}] (${r.type}, ${r.project}) ${r.content}\n   id: ${r.id}`,
          );
        }
        break;
      }
      case "list": {
        const mems = store.list({
          project: flags.project,
          limit: flags.limit ? parseInt(flags.limit, 10) : undefined,
        });
        if (mems.length === 0) {
          console.log("No memories stored yet.");
          break;
        }
        for (const m of mems) {
          console.log(`(${m.type}, ${m.project}) ${m.content}\n   id: ${m.id}`);
        }
        break;
      }
      case "delete": {
        const id = flags.positional[0];
        if (!id) throw new Error("Usage: ctxbridge delete <id>");
        console.log(store.delete(id) ? `Deleted ${id}.` : `No memory found with id ${id}.`);
        break;
      }
      case "stats": {
        const s = store.stats();
        console.log(`Total memories: ${s.total}`);
        console.log(`Embedder: ${s.embedder}`);
        console.log("By project:");
        for (const [p, c] of Object.entries(s.byProject)) console.log(`  ${p}: ${c}`);
        break;
      }
      default:
        console.error(`Unknown command: ${command}\n`);
        process.stdout.write(HELP);
        process.exitCode = 1;
    }
  } finally {
    store.close();
  }
}

main().catch((err) => {
  console.error("[ctxbridge] error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
