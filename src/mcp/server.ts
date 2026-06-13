#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MemoryStore } from "../core/memory.js";
import type { MemoryType } from "../core/types.js";

const MEMORY_TYPES = ["note", "fact", "preference", "project", "decision", "snippet"] as const;

/**
 * ctxbridge MCP server.
 *
 * This single stdio server is the universal connector: Claude Code, Codex CLI,
 * Gemini CLI, Cursor, and any other MCP-aware tool talk to it the same way,
 * sharing one local-first memory store.
 */
async function main(): Promise<void> {
  const store = new MemoryStore();

  // Default scope/source can be set per-CLI via env in that CLI's MCP config.
  const defaultSource = process.env.CTXBRIDGE_SOURCE ?? "mcp";
  const defaultProject = process.env.CTXBRIDGE_PROJECT ?? "global";

  const server = new McpServer({
    name: "ctxbridge",
    version: "0.1.0",
  });

  server.registerTool(
    "save_memory",
    {
      title: "Save a memory",
      description:
        "Store a durable fact, preference, decision, or note so it can be recalled later " +
        "from any connected agent. Use for things worth remembering across sessions and tools.",
      inputSchema: {
        content: z.string().describe("The thing to remember, written as a self-contained statement."),
        type: z
          .enum(MEMORY_TYPES)
          .optional()
          .describe("Category of memory. Defaults to 'note'."),
        tags: z.array(z.string()).optional().describe("Optional labels for filtering."),
        project: z
          .string()
          .optional()
          .describe("Project/workspace scope. Omit for a globally-visible memory."),
      },
    },
    async (args) => {
      const mem = await store.save({
        content: args.content,
        type: args.type as MemoryType | undefined,
        tags: args.tags,
        source: defaultSource,
        project: args.project ?? defaultProject,
      });
      return {
        content: [{ type: "text", text: `Saved memory ${mem.id} (type=${mem.type}, project=${mem.project}).` }],
      };
    },
  );

  server.registerTool(
    "search_memory",
    {
      title: "Search memories",
      description:
        "Retrieve the most relevant stored memories for a query using hybrid semantic + keyword search. " +
        "Call this before answering when prior context, preferences, or decisions might exist.",
      inputSchema: {
        query: z.string().describe("What you're trying to recall."),
        project: z.string().optional().describe("Limit to a project scope (globals always included)."),
        type: z.enum(MEMORY_TYPES).optional().describe("Limit to one memory type."),
        limit: z.number().int().positive().max(50).optional().describe("Max results (default 8)."),
      },
    },
    async (args) => {
      const results = await store.search(args.query, {
        project: args.project,
        type: args.type as MemoryType | undefined,
        limit: args.limit,
      });
      if (results.length === 0) {
        return { content: [{ type: "text", text: "No relevant memories found." }] };
      }
      const text = results
        .map(
          (r, i) =>
            `${i + 1}. [${r.score.toFixed(2)}] (${r.type}${r.project !== "global" ? `, ${r.project}` : ""}) ${r.content}  {id: ${r.id}}`,
        )
        .join("\n");
      return { content: [{ type: "text", text }] };
    },
  );

  server.registerTool(
    "list_memories",
    {
      title: "List recent memories",
      description: "List the most recently updated memories, optionally scoped to a project.",
      inputSchema: {
        project: z.string().optional(),
        limit: z.number().int().positive().max(100).optional(),
      },
    },
    async (args) => {
      const mems = store.list({ project: args.project, limit: args.limit });
      if (mems.length === 0) {
        return { content: [{ type: "text", text: "No memories stored yet." }] };
      }
      const text = mems
        .map((m) => `- (${m.type}, ${m.project}) ${m.content}  {id: ${m.id}}`)
        .join("\n");
      return { content: [{ type: "text", text }] };
    },
  );

  server.registerTool(
    "delete_memory",
    {
      title: "Delete a memory",
      description: "Remove a memory by its id (as shown in search/list results).",
      inputSchema: {
        id: z.string().describe("The memory id to delete."),
      },
    },
    async (args) => {
      const ok = store.delete(args.id);
      return {
        content: [{ type: "text", text: ok ? `Deleted memory ${args.id}.` : `No memory found with id ${args.id}.` }],
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server now runs until the client disconnects (stdin closes).
}

main().catch((err) => {
  // stderr is safe; stdout is reserved for the MCP protocol stream.
  console.error("[ctxbridge] fatal:", err);
  process.exit(1);
});
