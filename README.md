# ctxbridge

**One shared memory for all your AI coding agents.** Save a fact, preference, or
decision once — then recall it from **Claude Code, Codex CLI, Gemini CLI, Cursor**,
or any MCP-aware tool. ctxbridge runs locally, so your memory stays on your machine.

## Install

```bash
npm install -g @ca-stackforgestudio/ctxbridge
```

This adds two commands to your PATH:
- `ctxbridge` — manage your memories from the terminal
- `ctxbridge-mcp` — the MCP server your AI agents connect to

Requires Node ≥ 20.

## Connect it to your AI agent

All these tools speak the Model Context Protocol (MCP), so one server works
everywhere. Pick your tool:

**Claude Code**
```bash
claude mcp add ctxbridge -- ctxbridge-mcp
```

**Gemini CLI**
```bash
gemini mcp add ctxbridge ctxbridge-mcp
```

**Codex CLI** — add to `~/.codex/config.toml`:
```toml
[mcp_servers.ctxbridge]
command = "ctxbridge-mcp"
```

**Cursor** — add to `~/.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "ctxbridge": { "command": "ctxbridge-mcp" }
  }
}
```

Once connected, your agent can store and recall memories on its own using the
tools below — and anything it saves in one tool is instantly available in the others.

## Use it from the terminal

```bash
ctxbridge add "We use pnpm, not npm, for all our repos" --type preference
ctxbridge add "The billing service owns the /invoices API" --type fact --project billing
ctxbridge search "which package manager do we use"
ctxbridge list
ctxbridge stats
```

Memory types: `note` · `fact` · `preference` · `project` · `decision` · `snippet`

## What your agent can do

| Tool | Purpose |
|------|---------|
| `save_memory` | Remember a fact, preference, decision, or note. |
| `search_memory` | Recall the most relevant memories for a query. |
| `list_memories` | Show recent memories. |
| `delete_memory` | Forget a memory by id. |

## Better search (optional)

Out of the box, search works with zero setup and no API key. For higher-quality
semantic recall, switch to OpenAI embeddings:

```bash
export CTXBRIDGE_EMBEDDER=openai
export OPENAI_API_KEY=sk-...
```

## Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `CTXBRIDGE_DB` | `~/.ctxbridge/ctxbridge.db` | Where your memory is stored. |
| `CTXBRIDGE_EMBEDDER` | `local` | `local` (no key) or `openai`. |
| `OPENAI_API_KEY` | — | Required when embedder is `openai`. |
| `CTXBRIDGE_SOURCE` | `mcp` | Tag for which tool saved a memory. |
| `CTXBRIDGE_PROJECT` | `global` | Default project scope for saved memories. |

## License

MIT
