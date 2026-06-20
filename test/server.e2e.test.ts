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
    expect(all.json().total).toBe(9);
    expect(all.json().items).toHaveLength(9);

    const page = await app.inject({ method: 'GET', url: `${base}/agents?pageSize=2` });
    expect(page.json().items).toHaveLength(2);
    expect(page.json().pageToken).toBeTruthy();
  });

  it('unknown route returns 404 NOT_FOUND', async () => {
    const res = await app.inject({ method: 'GET', url: `${base}/nope` });
    expect(res.statusCode).toBe(404);
    expect(res.json().errorCode).toBe('NOT_FOUND');
  });
});
