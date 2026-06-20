import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServices } from '../src/services.js';
import { localBackend } from '../src/mcp/backend.js';
import { registerDiscoveryTools } from '../src/mcp/discovery-tools.js';

/**
 * Real MCP protocol test: a genuine SDK Client speaks JSON-RPC to our server over
 * a linked in-memory transport — list tools, then call them, asserting results.
 */
describe('ard-registry MCP server', () => {
  let client: Client;

  beforeAll(async () => {
    const services = await createServices();
    const server = new McpServer({ name: 'ard-registry', version: '0.1.0' });
    registerDiscoveryTools(server, localBackend(services));

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  });

  afterAll(async () => {
    await client?.close();
  });

  it('advertises the discover and explore tools with input schemas', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('discover');
    expect(names).toContain('explore');
    const discover = tools.find((t) => t.name === 'discover')!;
    expect(discover.inputSchema.properties).toHaveProperty('query');
    expect(discover.inputSchema.properties).toHaveProperty('kind');
  });

  it('discover returns the billing MCP for a wallet query', async () => {
    const res = await client.callTool({
      name: 'discover',
      arguments: { query: 'check my wallet balance and top up', limit: 1 },
    });
    const text = (res.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toContain('Cookiy Billing & Wallet MCP');
    expect(text).toContain('application/mcp-server-card+json');
    expect(text).toMatch(/invoke via: https?:\/\//); // gives the agent a target to call
  });

  it('discover honors the kind filter (skill only)', async () => {
    const res = await client.callTool({
      name: 'discover',
      arguments: { query: 'plan a study and write a screening questionnaire', kind: 'skill' },
    });
    const text = (res.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toContain('agent-skills');
    expect(text).not.toContain('mcp-server-card');
  });

  it('explore returns facet counts by type', async () => {
    const res = await client.callTool({
      name: 'explore',
      arguments: { facets: ['type'] },
    });
    const text = (res.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toContain('application/mcp-server-card+json: 5');
  });
});
