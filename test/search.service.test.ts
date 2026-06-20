import { describe, it, expect, beforeAll } from 'vitest';
import { Bm25Ranker } from '../src/index/ranker.js';
import { SearchService } from '../src/search/search.service.js';
import { SearchRequestSchema } from '../src/domain/registry.schema.js';
import { matchesFilter } from '../src/search/filter.js';
import { buildStore, tail } from './helpers.js';
import type { CatalogStore } from '../src/index/catalog-store.js';

const SELF = 'http://localhost:9010/api';
const UPSTREAM = {
  identifier: 'urn:air:nlweb.ai:registry:public',
  displayName: 'Public Agent Finder',
  type: 'application/ai-registry+json',
  url: 'https://finder.nlweb.ai/search',
};

function makeService(store: CatalogStore) {
  return new SearchService(store, new Bm25Ranker(), { selfUrl: SELF, upstreams: [UPSTREAM] });
}
const req = (body: unknown) => SearchRequestSchema.parse(body);

describe('matchesFilter', () => {
  it('AND across keys, OR within values', async () => {
    const entries = (await buildStore()).entries();
    const mcp = entries.filter((e) => matchesFilter(e, { type: ['application/mcp-server-card+json'] }));
    expect(mcp).toHaveLength(5);
    const tagged = entries.filter((e) => matchesFilter(e, { tags: ['billing', 'survey'] }));
    expect(new Set(tagged.map((e) => tail(e.identifier)))).toEqual(
      new Set(['billing', 'quant-survey']),
    );
  });
});

describe('SearchService', () => {
  let store: CatalogStore;
  beforeAll(async () => {
    store = await buildStore();
  });

  it('returns spec-shaped results with score + source', () => {
    const res = makeService(store).search(
      req({ query: { text: 'recruit participants and run interviews' } }),
    );
    expect(res.results.length).toBeGreaterThan(0);
    const top = res.results[0]!;
    expect(tail(top.identifier)).toBe('recruit-and-interview');
    expect(top.source).toBe(SELF);
    expect(Number.isInteger(top.score)).toBe(true);
    expect('url' in top || 'data' in top).toBe(true);
  });

  it('honors the type filter and drops zero-relevance entries', () => {
    const res = makeService(store).search(
      req({
        query: {
          text: 'design a quantitative survey',
          filter: { type: ['application/mcp-server-card+json'] },
        },
      }),
    );
    const names = res.results.map((r) => tail(r.identifier));
    expect(names).toContain('quant-survey');
    expect(names).not.toContain('billing'); // filtered-in by type but zero lexical relevance
    expect(res.results.every((r) => r.type === 'application/mcp-server-card+json')).toBe(true);
  });

  it('paginates with opaque pageToken', () => {
    const svc = makeService(store);
    const q = { query: { text: 'cookiy study research interview report survey' }, pageSize: 2 };
    const p1 = svc.search(req(q));
    expect(p1.results).toHaveLength(2);
    expect(p1.pageToken).toBeTruthy();
    const p2 = svc.search(req({ ...q, pageToken: p1.pageToken! }));
    const overlap = p1.results
      .map((r) => r.identifier)
      .filter((id) => p2.results.some((r) => r.identifier === id));
    expect(overlap).toHaveLength(0); // distinct pages
  });

  it('attaches referrals only when federation !== none', () => {
    const svc = makeService(store);
    const text = 'run interviews';
    expect(svc.search(req({ query: { text }, federation: 'none' })).referrals).toBeUndefined();
    expect(svc.search(req({ query: { text }, federation: 'referrals' })).referrals).toEqual([
      UPSTREAM,
    ]);
  });
});
