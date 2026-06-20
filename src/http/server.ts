import Fastify, { type FastifyInstance } from 'fastify';
import {
  AgentsQuerySchema,
  ExploreRequestSchema,
  SearchRequestSchema,
} from '../domain/registry.schema.js';
import type { SearchService } from '../search/search.service.js';
import type { ExploreService } from '../search/explore.service.js';
import type { AgentsService } from '../search/agents.service.js';

export interface ServerDeps {
  basePath: string;
  entryCount: number;
  searchService: SearchService;
  exploreService: ExploreService;
  agentsService: AgentsService;
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

  // POST /search — mandated discovery endpoint.
  app.post(`${base}/search`, async (request, reply) => {
    const parsed = SearchRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ errorCode: 'INVALID_ARGUMENT', message: parsed.error.message });
    }
    return deps.searchService.search(parsed.data);
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
