import type {
  Referral,
  SearchRequest,
  SearchResponse,
  SearchResultItem,
} from '../domain/registry.schema.js';
import type { SearchService } from './search.service.js';

/** Fetch a peer registry's /search; returns null on any failure (federation is best-effort). */
export type FetchSearch = (
  searchUrl: string,
  body: SearchRequest,
) => Promise<SearchResponse | null>;

export interface FederationConfig {
  selfUrl: string;
  /** Upstream registries: `url` is the peer's POST /search endpoint. */
  upstreams: Referral[];
}

const DEFAULT_TIMEOUT_MS = 2500;

/** Default fetcher: real HTTP POST with a short timeout, swallowing errors. */
export const httpFetchSearch: FetchSearch = async (searchUrl, body) => {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
    const res = await fetch(searchUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return (await res.json()) as SearchResponse;
  } catch {
    return null;
  }
};

/**
 * Federation layer over local search:
 *  - none      → local results only
 *  - referrals → local results + pointers to upstream registries
 *  - auto      → local results merged with live upstream results, re-ranked & deduped
 *
 * Upstream queries are issued with federation:none to prevent recursion, and any
 * upstream that errors or times out is skipped (best-effort). Federated result
 * sets are not deterministically pageable, so merged responses carry pageToken null.
 */
export class FederationService {
  constructor(
    private readonly local: SearchService,
    private readonly config: FederationConfig,
    private readonly fetchSearch: FetchSearch = httpFetchSearch,
  ) {}

  private referrals(): Referral[] {
    return this.config.upstreams.filter((u) => u.url !== this.config.selfUrl);
  }

  async search(req: SearchRequest): Promise<SearchResponse> {
    const localResult = this.local.search(req);

    if (req.federation === 'none') return localResult;

    if (req.federation === 'referrals') {
      const referrals = this.referrals();
      return referrals.length ? { ...localResult, referrals } : localResult;
    }

    // federation === 'auto': fetch + merge upstream results.
    const peers = this.referrals();
    const upstreamBody: SearchRequest = { ...req, federation: 'none', pageToken: undefined };
    const peerResponses = await Promise.all(
      peers.map((p) => this.fetchSearch(p.url, upstreamBody)),
    );

    const merged = new Map<string, SearchResultItem>();
    for (const item of localResult.results) merged.set(item.identifier, item);
    for (const resp of peerResponses) {
      if (!resp) continue;
      for (const item of resp.results) {
        const existing = merged.get(item.identifier);
        if (!existing || item.score > existing.score) merged.set(item.identifier, item);
      }
    }

    const results = [...merged.values()]
      .sort((a, b) => b.score - a.score || a.identifier.localeCompare(b.identifier))
      .slice(0, req.pageSize);

    const referrals = peers;
    const response: SearchResponse = { results, pageToken: null };
    if (referrals.length) response.referrals = referrals;
    return response;
  }
}
