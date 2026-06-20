import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/main.js';
import { tail } from './helpers.js';

const here = resolve(fileURLToPath(import.meta.url), '..');
const UPSTREAM_DIR = resolve(here, 'fixtures/upstream');
const UP_PORT = 9031;
const PRIMARY_PORT = 9030;

/**
 * Live federation: two real listening registries. The primary (cookiy catalogs)
 * has no weather resource; the upstream (fixtures) does. federation:auto must
 * fetch the upstream over real HTTP and merge its result in.
 */
describe('live federation across two real registries', () => {
  let upstream: FastifyInstance;
  let primary: FastifyInstance;

  beforeAll(async () => {
    const up = await createApp({
      ...process.env,
      ARD_PORT: String(UP_PORT),
      ARD_HOST: '127.0.0.1',
      ARD_CATALOG_DIR: UPSTREAM_DIR,
    });
    upstream = up.app;
    await upstream.listen({ host: '127.0.0.1', port: UP_PORT });

    const upstreamRef = JSON.stringify([
      {
        identifier: 'urn:air:peer.example:registry:main',
        displayName: 'Peer Registry',
        type: 'application/ai-registry+json',
        url: `http://127.0.0.1:${UP_PORT}/api/search`,
      },
    ]);
    const pr = await createApp({
      ...process.env,
      ARD_PORT: String(PRIMARY_PORT),
      ARD_HOST: '127.0.0.1',
      ARD_UPSTREAMS: upstreamRef,
    });
    primary = pr.app;
    await primary.listen({ host: '127.0.0.1', port: PRIMARY_PORT });
  });

  afterAll(async () => {
    await Promise.all([primary?.close(), upstream?.close()]);
  });

  const search = (body: unknown) =>
    primary
      .inject({ method: 'POST', url: '/api/search', payload: body as object })
      .then((r) => r.json());

  it('federation:none finds no weather resource locally', async () => {
    const res = await search({ query: { text: 'weather forecast for tomorrow' }, federation: 'none' });
    expect(res.results).toHaveLength(0);
  });

  it('federation:auto merges the upstream weather resource over live HTTP', async () => {
    const res = await search({ query: { text: 'weather forecast for tomorrow' }, federation: 'auto' });
    const ids = res.results.map((r: { identifier: string }) => tail(r.identifier));
    expect(ids).toContain('weather');
    const weather = res.results.find((r: { identifier: string }) => tail(r.identifier) === 'weather');
    expect(weather.source).toContain(`:${UP_PORT}`); // came from the upstream registry
  });
});
