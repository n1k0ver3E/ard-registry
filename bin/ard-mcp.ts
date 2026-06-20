#!/usr/bin/env tsx
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServices } from '../src/services.js';
import { registerDiscoveryTools } from '../src/mcp/discovery-tools.js';
import { httpBackend, localBackend, type DiscoveryBackend } from '../src/mcp/backend.js';

/**
 * ARD discovery as an MCP server (stdio) — the third consumption surface
 * alongside the CLI and REST API. Add it to any MCP client and the agent gets a
 * single `discover` tool; everything else is found at runtime.
 *
 * By default it runs in-process over the local catalogs. Set ARD_REGISTRY_URL to
 * proxy a running registry instead (e.g. http://localhost:9010/api).
 */
async function main(): Promise<void> {
  const remote = process.env.ARD_REGISTRY_URL;
  const backend: DiscoveryBackend = remote
    ? httpBackend(remote)
    : localBackend(await createServices());

  const server = new McpServer({ name: 'ard-registry', version: '0.1.0' });
  registerDiscoveryTools(server, backend);

  await server.connect(new StdioServerTransport());
  // Logs go to stderr so stdout stays a clean JSON-RPC stream.
  console.error(`ard-registry MCP server ready (backend: ${backend.label})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
