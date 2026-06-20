import { describe, it, expect, beforeAll } from 'vitest';
import { Bm25Ranker } from '../src/index/ranker.js';
import { SearchService } from '../src/search/search.service.js';
import { FederationService, type FetchSearch } from '../src/search/federation.service.js';
import { SearchRequestSchema, type Referral, type SearchResultItem } from '../src/domain/registry.schema.js';
import { buildStore, tail } from './helpers.js';
import type { CatalogStore } from '../src/index/catalog-store.js';

const SELF = 'http://localhost:9010/api';
const PEER: Referral = {
  identifier: 'urn:air:peer.example:registry:main',
  displayName: 'Peer Registry',
  type: 'application/ai-registry+json',
  url: 'https://peer.example/search',
};
const PEER_WEATHER: SearchResultItem = {
  identifier: 'urn:air:peer.example:mcp:weather',
  displayName: 'Weather MCP',
  type: 'application/mcp-server-card+json',
  url: 'https://peer.example/mcp/weather.json',
  score: 90,
  source: 'https://peer.example/api',
};
const req = (body: unknown) => SearchRequestSchema.parse(body);

describe('FederationService', () => {
  let store: CatalogStore;
  let local: SearchService;
  beforeAll(async () => {
    store = await buildStore();
    local = new SearchService(store, new Bm25Ranker(), { selfUrl: SELF });
  });

  const fed = (fetchSearch: FetchSearch) =>
    new FederationService(local, { selfUrl: SELF, upstreams: [PEER] }, fetchSearch);

  const neverFetch: FetchSearch = async () => {
    throw new Error('upstream should not be contacted');
  };

  it('none: local only, no referrals, no upstream call', async () => {
    const res = await fed(neverFetch).search(
      req({ query: { text: 'recruit participants and run interviews' }, federation: 'none' }),
    );
    expect(res.referrals).toBeUndefined();
    expect(tail(res.results[0]!.identifier)).toBe('recruit-and-interview');
  });

  it('referrals: returns pointers without contacting upstreams', async () => {
    const res = await fed(neverFetch).search(
      req({ query: { text: 'run interviews' }, federation: 'referrals' }),
    );
    expect(res.referrals).toEqual([PEER]);
    expect(res.results.some((r) => r.identifier === PEER_WEATHER.identifier)).toBe(false);
  });

  it('auto: merges live upstream results, re-ranked by score', async () => {
    const fetchSearch: FetchSearch = async (url) =>
      url === PEER.url ? { results: [PEER_WEATHER], pageToken: null } : null;
    const res = await fed(fetchSearch).search(
      req({ query: { text: 'recruit participants and run interviews' }, federation: 'auto' }),
    );
    const ids = res.results.map((r) => r.identifier);
    expect(ids).toContain(PEER_WEATHER.identifier); // upstream entry merged in
    expect(tail(res.results[0]!.identifier)).toBe('recruit-and-interview'); // local 100 still tops 90
    // scores are monotonically non-increasing
    for (let i = 1; i < res.results.length; i++) {
      expect(res.results[i - 1]!.score).toBeGreaterThanOrEqual(res.results[i]!.score);
    }
  });

  it('auto: dedupes by identifier, keeping the higher score', async () => {
    const dupLow: SearchResultItem = {
      identifier: 'urn:air:cookiy.ai:mcp:recruit-and-interview',
      displayName: 'Recruit (stale peer copy)',
      type: 'application/mcp-server-card+json',
      url: 'https://peer.example/stale.json',
      score: 5,
      source: 'https://peer.example/api',
    };
    const fetchSearch: FetchSearch = async () => ({ results: [dupLow], pageToken: null });
    const res = await fed(fetchSearch).search(
      req({ query: { text: 'recruit participants and run interviews' }, federation: 'auto' }),
    );
    const recruit = res.results.filter(
      (r) => r.identifier === 'urn:air:cookiy.ai:mcp:recruit-and-interview',
    );
    expect(recruit).toHaveLength(1);
    expect(recruit[0]!.score).toBe(100); // local wins over stale peer copy
  });

  it('auto: tolerates an upstream that errors (best-effort)', async () => {
    const fetchSearch: FetchSearch = async () => null; // upstream down
    const res = await fed(fetchSearch).search(
      req({ query: { text: 'recruit participants and run interviews' }, federation: 'auto' }),
    );
    expect(res.results.length).toBeGreaterThan(0);
    expect(tail(res.results[0]!.identifier)).toBe('recruit-and-interview');
  });
});
