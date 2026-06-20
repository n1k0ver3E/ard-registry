import type { CatalogStore } from '../index/catalog-store.js';
import type { Ranker } from '../index/ranker.js';
import type {
  Referral,
  SearchRequest,
  SearchResponse,
  SearchResultItem,
} from '../domain/registry.schema.js';
import { matchesFilter } from './filter.js';

export interface SearchServiceConfig {
  /** Absolute base URL of this registry; emitted as `source` on each result. */
  selfUrl: string;
  /** Optional upstream registries returned as referrals when federation !== 'none'. */
  upstreams?: Referral[];
}

function encodeToken(offset: number): string {
  return Buffer.from(`offset:${offset}`, 'utf8').toString('base64url');
}
function decodeToken(token: string | undefined): number {
  if (!token) return 0;
  const m = /^offset:(\d+)$/.exec(Buffer.from(token, 'base64url').toString('utf8'));
  const n = m ? Number(m[1]) : 0;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * POST /search business logic: filter -> rank -> paginate -> attach referrals.
 * Transport-agnostic; the HTTP layer only validates input and serializes output.
 */
export class SearchService {
  constructor(
    private readonly store: CatalogStore,
    private readonly ranker: Ranker,
    private readonly config: SearchServiceConfig,
  ) {}

  search(req: SearchRequest): SearchResponse {
    const candidates = this.store
      .entries()
      .filter((e) => matchesFilter(e, req.query.filter));

    const ranked = this.ranker
      .rank(req.query.text, candidates)
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.entry.identifier.localeCompare(b.entry.identifier));

    const offset = decodeToken(req.pageToken);
    const page = ranked.slice(offset, offset + req.pageSize);
    const nextOffset = offset + req.pageSize;
    const nextToken = nextOffset < ranked.length ? encodeToken(nextOffset) : null;

    const results: SearchResultItem[] = page.map(({ entry, score }) => ({
      ...entry,
      score,
      source: this.config.selfUrl,
    }));

    const response: SearchResponse = { results, pageToken: nextToken };
    if (req.federation !== 'none' && this.config.upstreams?.length) {
      response.referrals = this.config.upstreams;
    }
    return response;
  }
}
