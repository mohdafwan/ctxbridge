# ctxbridge

**A cross-agent memory layer.** One shared, local-first memory that bridges
**Claude Code, Codex CLI, Gemini CLI, Cursor** — and any other MCP-aware tool —
through a single MCP server. Save something once in one agent; recall it from all of them.

> Status: **Phase-1 MVP**. Core engine + MCP server + management CLI work today.
> Cloud sync (the "hybrid" half) and the web/extension surface for non-technical
> users are Phase 2–3 — see [Roadmap](#roadmap).

## How it works

```
        ┌─────────────────────────────────────────┐
        │           CORE MEMORY ENGINE              │
        │  SQLite + hybrid (semantic + keyword)     │
        │  search · local-first · ~/.ctxbridge/     │
        └─────────────────────────────────────────┘
              ▲                          ▲
      ┌───────┘                   ┌──────┘
      │ MCP SERVER (ctxbridge-mcp)│ MGMT CLI (ctxbridge)
      └───────┘                   └──────┘
        │
  Claude Code · Codex CLI · Gemini CLI · Cursor   ← one integration, all clients
```

All four CLIs speak the **Model Context Protocol (MCP)**, so a single stdio MCP
server is the universal plug. The model gets four tools: `save_memory`,
`search_memory`, `list_memories`, `delete_memory`.

## Install

```bash
npm install -g @ca-stackforgestudio/ctxbridge
```

This puts the `ctxbridge` and `ctxbridge-mcp` commands on your PATH.

Requires Node ≥ 20.

### From source (development)

```bash
npm install        # install deps (builds the native better-sqlite3 binding)
npm run build      # compile TypeScript to dist/
npm link           # optional: put `ctxbridge` and `ctxbridge-mcp` on your PATH
```

### Embeddings

Works with **zero config** out of the box using a built-in local embedder
(hashed bag-of-words — decent, no API key, no network). For higher-quality
semantic search, switch to OpenAI:

```bash
export CTXBRIDGE_EMBEDDER=openai
export OPENAI_API_KEY=sk-...
```

> Note: switching embedders changes the vector space. For the MVP, pick one and
> stick with it (re-embedding existing memories on switch is a Phase-2 item).

## Try it from the command line

```bash
ctxbridge add "We use pnpm, not npm, for all Spotted repos" --type preference
ctxbridge add "The billing service owns the /invoices API" --type fact --project billing
ctxbridge search "which package manager do we use"
ctxbridge list
ctxbridge stats
```

(During development, before `npm link`, use `npm run dev:cli -- <args>`.)

## Wire it into your CLIs

Point each CLI at the MCP server. After `npm link`, the command is `ctxbridge-mcp`.
Without linking, use `node /abs/path/to/dist/mcp/server.js`.

### Claude Code

```bash
claude mcp add ctxbridge -- ctxbridge-mcp
```

Or in `.mcp.json` / settings:

```json
{
  "mcpServers": {
    "ctxbridge": { "command": "ctxbridge-mcp" }
  }
}
```

### Codex CLI

In `~/.codex/config.toml`:

```toml
[mcp_servers.ctxbridge]
command = "ctxbridge-mcp"
```

### Gemini CLI

```bash
gemini mcp add ctxbridge ctxbridge-mcp
```

Or in `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "ctxbridge": { "command": "ctxbridge-mcp" }
  }
}
```

### Cursor

In `~/.cursor/mcp.json` (or project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "ctxbridge": { "command": "ctxbridge-mcp" }
  }
}
```

### Per-CLI scoping (optional)

Set env on the server command to tag where memories come from and scope them:

```json
{
  "mcpServers": {
    "ctxbridge": {
      "command": "ctxbridge-mcp",
      "env": { "CTXBRIDGE_SOURCE": "claude-code", "CTXBRIDGE_PROJECT": "billing" }
    }
  }
}
```

## MCP tools

| Tool | What it does |
|------|--------------|
| `save_memory` | Store a fact/preference/decision/note (with optional type, tags, project). |
| `search_memory` | Hybrid semantic + keyword retrieval, scoped by project/type. |
| `list_memories` | Most recently updated memories. |
| `delete_memory` | Remove a memory by id. |

## Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `CTXBRIDGE_DB` | `~/.ctxbridge/ctxbridge.db` | Location of the local store. |
| `CTXBRIDGE_EMBEDDER` | `local` | `local` or `openai`. |
| `OPENAI_API_KEY` | — | Required when embedder is `openai`. |
| `CTXBRIDGE_OPENAI_EMBED_MODEL` | `text-embedding-3-small` | OpenAI embedding model. |
| `CTXBRIDGE_SOURCE` | `mcp` | Tag for memories created via MCP. |
| `CTXBRIDGE_PROJECT` | `global` | Default project scope for MCP saves. |

## Roadmap

- **Phase 1 (done):** core engine, hybrid search, MCP server, management CLI.
- **Phase 2:** cloud sync layer (local ⇄ shared team store) for the "hybrid"
  storage model; conflict handling via tombstones + `updated_at`.
- **Phase 3:** web dashboard + browser extension so non-technical users share
  the same memory without touching a terminal; auth, teams, access control.
- **Later:** re-embedding on embedder switch, sqlite-vec ANN for large corpora,
  automatic memory extraction from sessions.

## Project layout

```
src/
  core/
    config.ts      runtime config + paths
    types.ts       shared types
    db.ts          SQLite schema, FTS triggers, vector (de)serialization
    embeddings.ts  pluggable embedder (local default, OpenAI optional)
    memory.ts      MemoryStore: save / search / list / delete / stats
  mcp/
    server.ts      stdio MCP server (the universal CLI connector)
  cli/
    index.ts       `ctxbridge` management CLI
```
