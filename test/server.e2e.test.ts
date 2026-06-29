import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/main.js';
import { tail } from './helpers.js';

describe('HTTP registry (Fastify inject)', () => {
  let app: FastifyInstance;
  const base = '/api';

  beforeAll(async () => {
    ({ app } = await createApp());
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('POST /search returns spec-shaped ranked results', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${base}/search`,
      payload: { query: { text: 'recruit participants and run AI-moderated interviews' } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
    const top = body.results[0];
    expect(tail(top.identifier)).toBe('recruit-and-interview');
    for (const item of body.results) {
      expect(Number.isInteger(item.score)).toBe(true);
      expect(item.score).toBeGreaterThanOrEqual(0);
      expect(item.score).toBeLessThanOrEqual(100);
      expect(typeof item.source).toBe('string');
      expect(item.identifier && item.displayName && item.type).toBeTruthy();
      expect('url' in item || 'data' in item).toBe(true);
    }
  });

  it('POST /search with a type filter only returns that media type', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${base}/search`,
      payload: {
        query: {
          text: 'plan a study and synthesize a report',
          filter: { type: ['text/markdown; profile="urn:air:agent-skills"'] },
        },
      },
    });
    const body = res.json();
    expect(body.results.length).toBeGreaterThan(0);
    expect(
      body.results.every((r: { type: string }) => r.type === 'text/markdown; profile="urn:air:agent-skills"'),
    ).toBe(true);
  });

  it('POST /search rejects a malformed body with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${base}/search`,
      payload: { query: { text: 123 } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().errorCode).toBe('INVALID_ARGUMENT');
  });

  it('POST /explore returns facet counts by type over the whole catalog', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `${base}/explore`,
      payload: { query: { text: '' }, resultType: { facets: [{ field: 'type' }] } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.resultType).toBe('facets');
    const typeBuckets = body.facets.type.buckets as Array<{ value: string; count: number }>;
    const mcp = typeBuckets.find((b) => b.value === 'application/mcp-server-card+json');
    expect(mcp?.count).toBe(5);
  });

  it('GET /agents lists all indexed entries with pagination', async () => {
    const all = await app.inject({ method: 'GET', url: `${base}/agents` });
    expect(all.statusCode).toBe(200);
    expect(all.json().total).toBe(10);
    expect(all.json().items).toHaveLength(10);
    expect(all.json().items.some((item: { identifier: string }) => item.identifier === 'urn:air:xquik.com:skill:hermes-tweet')).toBe(true);

    const page = await app.inject({ method: 'GET', url: `${base}/agents?pageSize=2` });
    expect(page.json().items).toHaveLength(2);
    expect(page.json().pageToken).toBeTruthy();
  });

  it('serves a self-manifest at /.well-known/ai-catalog.json', async () => {
    const res = await app.inject({ method: 'GET', url: '/.well-known/ai-catalog.json' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.specVersion).toBe('1.0');
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].type).toBe('application/ai-registry+json');
    expect(body.entries[0].identifier).toMatch(/^urn:air:[^:]+:registry:search$/);
    expect(body.entries[0].url).toContain('/search');
  });

  it('serves the Web console HTML at /', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('ard-registry');
    expect(res.body).toContain(`const BASE = "${base}"`); // __BASE__ placeholder wired in
    expect(res.body).not.toContain('__BASE__');
  });

  it('serves an OpenAPI 3.1 document derived from the zod schemas', async () => {
    const res = await app.inject({ method: 'GET', url: `${base}/openapi.json` });
    expect(res.statusCode).toBe(200);
    const doc = res.json();
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.paths).toHaveProperty(`${base}/search`);
    expect(doc.paths[`${base}/search`].post.requestBody.content['application/json'].schema).toBeTruthy();
  });

  it('GET /sources reports per-source crawl status', async () => {
    const res = await app.inject({ method: 'GET', url: `${base}/sources` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.count).toBe(4); // 4 local catalogs (default source set)
    expect(body.sources.every((s: { ok: boolean }) => s.ok)).toBe(true);
    expect(body.sources.map((s: { id: string }) => s.id)).toContain('cookiy-mcp');
    expect(body.sources.map((s: { id: string }) => s.id)).toContain('hermes-tweet');
  });

  it('unknown route returns 404 NOT_FOUND', async () => {
    const res = await app.inject({ method: 'GET', url: `${base}/nope` });
    expect(res.statusCode).toBe(404);
    expect(res.json().errorCode).toBe('NOT_FOUND');
  });
});
