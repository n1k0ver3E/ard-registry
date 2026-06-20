import type { CatalogStore } from '../index/catalog-store.js';
import type { Ranker } from '../index/ranker.js';
import type {
  SearchRequest,
  SearchResponse,
  SearchResultItem,
} from '../domain/registry.schema.js';
import { matchesFilter } from './filter.js';

export interface SearchServiceConfig {
  /** Absolute base URL of this registry; emitted as `source` on each result. */
  selfUrl: string;
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
 * Local POST /search business logic: filter -> rank -> paginate. Federation
 * (referrals / auto-merge) is layered on top by FederationService, keeping this
 * service single-responsibility (local index only).
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

    return { results, pageToken: nextToken };
  }
}
