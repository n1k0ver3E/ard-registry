import type { CatalogStore } from '../index/catalog-store.js';
import type { Ranker } from '../index/ranker.js';
import type { ExploreRequest, ExploreResponse, FacetBucket } from '../domain/registry.schema.js';
import { matchesFilter } from './filter.js';
import { fieldValues } from './filter.js';

const DEFAULT_FACET_FIELDS = ['type'];
const DEFAULT_LIMIT = 20;

/**
 * POST /explore: facet aggregation (no ranking) over the entries matched by the
 * query. "Matched" = passes the filter and, when query text is non-empty, has a
 * positive lexical score — so facets describe the same slice /search would rank.
 */
export class ExploreService {
  constructor(
    private readonly store: CatalogStore,
    private readonly ranker: Ranker,
  ) {}

  explore(req: ExploreRequest): ExploreResponse {
    let matched = this.store.entries().filter((e) => matchesFilter(e, req.query.filter));
    if (req.query.text.trim().length > 0) {
      const positive = new Set(
        this.ranker
          .rank(req.query.text, matched)
          .filter((r) => r.score > 0)
          .map((r) => r.entry.identifier),
      );
      matched = matched.filter((e) => positive.has(e.identifier));
    }

    const fields = req.resultType?.facets?.length
      ? req.resultType.facets
      : DEFAULT_FACET_FIELDS.map((field) => ({ field, limit: undefined as number | undefined }));

    const facets: ExploreResponse['facets'] = {};
    for (const { field, limit } of fields) {
      const counts = new Map<string, number>();
      for (const entry of matched) {
        for (const value of fieldValues(entry, field)) {
          counts.set(value, (counts.get(value) ?? 0) + 1);
        }
      }
      const sorted: FacetBucket[] = [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
      const cap = limit ?? DEFAULT_LIMIT;
      const buckets = sorted.slice(0, cap);
      const otherCount = sorted.slice(cap).reduce((s, b) => s + b.count, 0);
      facets[field] = { buckets, otherCount };
    }

    return { resultType: 'facets', facets };
  }
}
