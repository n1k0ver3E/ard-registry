import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodTypeAny } from 'zod';
import {
  SearchRequestSchema,
  SearchResponseSchema,
  ExploreRequestSchema,
} from '../domain/registry.schema.js';
import { AICatalogManifestSchema } from '../domain/catalog.schema.js';

/** Inline a zod schema as an OpenAPI-compatible JSON Schema (single source of truth). */
const json = (schema: ZodTypeAny): Record<string, unknown> =>
  zodToJsonSchema(schema, { target: 'openApi3', $refStrategy: 'none' }) as Record<string, unknown>;

const jsonBody = (schema: ZodTypeAny) => ({
  required: true,
  content: { 'application/json': { schema: json(schema) } },
});
const jsonResponse = (description: string, schema: Record<string, unknown>) => ({
  description,
  content: { 'application/json': { schema } },
});

/**
 * Build the OpenAPI 3.1 document for the registry REST API, deriving request/
 * response schemas from the same zod definitions the server validates against —
 * so the docs can never drift from the implementation.
 */
export function buildOpenApiDocument(opts: { basePath: string; serverUrl: string }): object {
  const base = opts.basePath.replace(/\/$/, '');
  const sourcesSchema = {
    type: 'object',
    properties: {
      count: { type: 'integer' },
      sources: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            url: { type: 'string' },
            ok: { type: 'boolean' },
            entryCount: { type: 'integer' },
            lastCrawlAt: { type: 'string', nullable: true },
            error: { type: 'string' },
          },
        },
      },
    },
  };

  return {
    openapi: '3.1.0',
    info: {
      title: 'ard-registry',
      version: '0.1.0',
      description:
        'Agentic Resource Discovery (ARD) registry. Crawls ai-catalog.json manifests and answers ' +
        'natural-language discovery queries. Discovery happens before invocation; resources are then ' +
        'called via their native protocol (MCP / A2A / OpenAPI).',
    },
    servers: [{ url: opts.serverUrl }],
    paths: {
      [`${base}/search`]: {
        post: {
          summary: 'Discover resources (ranked)',
          description: 'Natural-language + filter → ranked catalog entries. Federation-aware.',
          requestBody: jsonBody(SearchRequestSchema),
          responses: { '200': jsonResponse('Ranked results', json(SearchResponseSchema)) },
        },
      },
      [`${base}/explore`]: {
        post: {
          summary: 'Facet aggregation',
          description: 'Counts by type / publisher / tags over the matched slice.',
          requestBody: jsonBody(ExploreRequestSchema),
          responses: {
            '200': jsonResponse('Facet counts', {
              type: 'object',
              properties: { resultType: { type: 'string' }, facets: { type: 'object' } },
            }),
          },
        },
      },
      [`${base}/agents`]: {
        get: {
          summary: 'List all indexed resources',
          description: 'Deterministic, cacheable listing with orderBy + pagination.',
          parameters: [
            { name: 'orderBy', in: 'query', schema: { type: 'string' }, example: 'name' },
            { name: 'pageSize', in: 'query', schema: { type: 'integer', maximum: 100 } },
            { name: 'pageToken', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': jsonResponse('Paginated entries', {
              type: 'object',
              properties: {
                items: { type: 'array', items: { type: 'object' } },
                total: { type: 'integer' },
                pageToken: { type: 'string', nullable: true },
              },
            }),
          },
        },
      },
      [`${base}/sources`]: {
        get: {
          summary: 'Crawl source status',
          description: 'Per-source crawl health (management/observability).',
          responses: { '200': jsonResponse('Source status', sourcesSchema) },
        },
      },
      [`${base}/health`]: {
        get: {
          summary: 'Health check',
          responses: {
            '200': jsonResponse('OK', {
              type: 'object',
              properties: { status: { type: 'string' }, entries: { type: 'integer' } },
            }),
          },
        },
      },
      '/.well-known/ai-catalog.json': {
        get: {
          summary: 'This registry as a discoverable ARD resource',
          responses: { '200': jsonResponse('Self manifest', json(AICatalogManifestSchema)) },
        },
      },
    },
  };
}
