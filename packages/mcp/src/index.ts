#!/usr/bin/env node
/**
 * Cursor MCP server for Performance Review Manager.
 * Speaks MCP over stdio; mutates the local PRM API (default http://127.0.0.1:8787).
 *
 * Env:
 *   PRM_API_URL   default http://127.0.0.1:8787
 *   PRM_PASSWORD  unlock password (required for auto-unlock; no demo default)
 *   PRM_TOKEN     optional pre-unlocked session token
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PrmClient } from "./client.js";
import { registerPrmTools } from "./tools.js";

async function main() {
  const client = new PrmClient();
  const server = new McpServer({
    name: "prm",
    version: "0.1.0",
  });

  registerPrmTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `PRM MCP ready → ${client.baseUrl} (tools: status/unlock/people/roles/cycles/evidence/docs/bulk)`,
  );
}

main().catch((err) => {
  console.error("PRM MCP failed to start:", err);
  process.exit(1);
});
