import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ExploreRequestSchema,
  SearchRequestSchema,
  type SearchResponse,
  type ExploreResponse,
} from '../domain/registry.schema.js';
import { KINDS, kindFilter } from '../search/kinds.js';
import type { DiscoveryBackend } from './backend.js';

function renderSearch(query: string, res: SearchResponse): string {
  if (res.results.length === 0) {
    return `No matching agentic resources found for: "${query}".`;
  }
  const lines = res.results.map((r, i) => {
    const target = 'url' in r && r.url ? r.url : '(inline data)';
    const caps = r.capabilities?.length ? `\n   capabilities: ${r.capabilities.join(', ')}` : '';
    return (
      `${i + 1}. [score ${r.score}] ${r.displayName}\n` +
      `   id: ${r.identifier}\n` +
      `   type: ${r.type}\n` +
      `   invoke via: ${target}${caps}`
    );
  });
  const referrals = res.referrals?.length
    ? `\n\nFederated registries you may also query:\n` +
      res.referrals.map((ref) => `- ${ref.displayName}: ${ref.url}`).join('\n')
    : '';
  return (
    `Discovered ${res.results.length} resource(s) for "${query}". ` +
    `Pick the most relevant, verify its trustManifest, then call it via its native protocol (type + invoke-via url).\n\n` +
    lines.join('\n\n') +
    referrals
  );
}

function renderExplore(res: ExploreResponse): string {
  const blocks = Object.entries(res.facets).map(([field, facet]) => {
    const rows = facet.buckets.map((b) => `  ${b.value}: ${b.count}`).join('\n');
    const other = facet.otherCount ? `\n  (+${facet.otherCount} more in other buckets)` : '';
    return `${field}:\n${rows}${other}`;
  });
  return `Facet counts over the catalog:\n\n${blocks.join('\n\n')}`;
}

/**
 * Register the ARD discovery tools (`discover`, `explore`) on an MCP server.
 * The handlers reuse the registry's validated request schemas and services via
 * the backend, so there is no second implementation of search to drift.
 */
export function registerDiscoveryTools(server: McpServer, backend: DiscoveryBackend): void {
  server.registerTool(
    'discover',
    {
      title: 'Discover agentic resources',
      description:
        'Find agentic resources (MCP servers, agent skills, CLIs, A2A agents) for a task by ' +
        'natural-language query, instead of hardcoding tools. Returns ranked catalog entries with ' +
        'the media `type` and an `invoke via` url; after picking one, connect to it through its own ' +
        'native protocol (MCP / A2A / OpenAPI). Discovery happens before invocation.',
      inputSchema: {
        query: z.string().describe('Natural-language description of the capability/task you need'),
        kind: z
          .enum(KINDS as [string, ...string[]])
          .optional()
          .describe('Restrict to a resource kind: mcp | skill | cli | agent'),
        limit: z.number().int().min(1).max(50).optional().describe('Max results (default 10)'),
        federation: z
          .enum(['none', 'referrals', 'auto'])
          .optional()
          .describe('none = local only; referrals = also list peer registries; auto = merge peers'),
      },
    },
    async ({ query, kind, limit, federation }) => {
      const filter = kindFilter(kind);
      const req = SearchRequestSchema.parse({
        query: { text: query, ...(filter ? { filter } : {}) },
        federation: federation ?? 'none',
        pageSize: limit ?? 10,
      });
      const res = await backend.search(req);
      return { content: [{ type: 'text', text: renderSearch(query, res) }] };
    },
  );

  server.registerTool(
    'explore',
    {
      title: 'Explore the resource catalog',
      description:
        'Get facet counts (how many resources by type / publisher / tags) to understand what is ' +
        'available before discovering. Optionally scope by a query.',
      inputSchema: {
        query: z.string().optional().describe('Optional query to scope the facets'),
        facets: z
          .array(z.string())
          .optional()
          .describe('Fields to aggregate by, e.g. ["type","tags","publisher"] (default ["type"])'),
      },
    },
    async ({ query, facets }) => {
      const fields = (facets?.length ? facets : ['type']).map((field) => ({ field }));
      const req = ExploreRequestSchema.parse({
        query: { text: query ?? '' },
        resultType: { facets: fields },
      });
      const res = await backend.explore(req);
      return { content: [{ type: 'text', text: renderExplore(res) }] };
    },
  );
}
