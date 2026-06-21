import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  AgentsQuerySchema,
  ExploreRequestSchema,
  SearchRequestSchema,
} from '../domain/registry.schema.js';
import type { FederationService } from '../search/federation.service.js';
import type { ExploreService } from '../search/explore.service.js';
import type { AgentsService } from '../search/agents.service.js';
import type { AICatalogManifest } from '../domain/catalog.schema.js';
import type { SourceStatus } from '../crawl/crawler.js';
import { buildOpenApiDocument } from './openapi.js';

const CONSOLE_HTML = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'console.html'),
  'utf8',
);

export interface ServerDeps {
  basePath: string;
  entryCount: number;
  /** Absolute base URL of this registry (for the OpenAPI `servers` entry). */
  selfUrl: string;
  federationService: FederationService;
  exploreService: ExploreService;
  agentsService: AgentsService;
  /** This registry's own manifest, served at /.well-known/ai-catalog.json. */
  selfManifest: AICatalogManifest;
  /** Per-source crawl status for the management/observability endpoint. */
  crawlStatus: () => SourceStatus[];
}

/**
 * Build the Fastify app with the ARD registry routes mounted under basePath.
 * The HTTP layer only validates input (zod) and serializes output — all logic
 * lives in the injected services.
 */
export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  const base = deps.basePath.replace(/\/$/, '');

  app.get(`${base}/health`, async () => ({ status: 'ok', entries: deps.entryCount }));

  // Self-hosted Web console (vanilla, zero external deps) at / and /ui.
  const consoleHtml = CONSOLE_HTML.replace(/__BASE__/g, base);
  app.get('/', async (_req, reply) => reply.type('text/html').send(consoleHtml));
  app.get('/ui', async (_req, reply) => reply.type('text/html').send(consoleHtml));

  // OpenAPI 3.1 document (derived from the same zod schemas the server validates with).
  app.get(`${base}/openapi.json`, async () =>
    buildOpenApiDocument({ basePath: base, serverUrl: deps.selfUrl }),
  );

  // Management/observability: per-source crawl status (last crawl, ok, counts).
  app.get(`${base}/sources`, async () => {
    const sources = deps.crawlStatus();
    return { sources, count: sources.length };
  });

  // Self-advertisement: makes this registry itself discoverable / federatable.
  app.get('/.well-known/ai-catalog.json', async (_request, reply) => {
    reply.header('content-type', 'application/json');
    return deps.selfManifest;
  });

  // POST /search — mandated discovery endpoint (federation-aware).
  app.post(`${base}/search`, async (request, reply) => {
    const parsed = SearchRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ errorCode: 'INVALID_ARGUMENT', message: parsed.error.message });
    }
    return deps.federationService.search(parsed.data);
  });

  // POST /explore — optional facet introspection.
  app.post(`${base}/explore`, async (request, reply) => {
    const parsed = ExploreRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ errorCode: 'INVALID_ARGUMENT', message: parsed.error.message });
    }
    return deps.exploreService.explore(parsed.data);
  });

  // GET /agents — optional deterministic listing.
  app.get(`${base}/agents`, async (request, reply) => {
    const parsed = AgentsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ errorCode: 'INVALID_ARGUMENT', message: parsed.error.message });
    }
    return deps.agentsService.list(parsed.data);
  });

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      errorCode: 'NOT_FOUND',
      message: `Route ${request.method} ${request.url} not found.`,
    });
  });

  return app;
}
