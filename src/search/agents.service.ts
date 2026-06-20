import type { CatalogStore } from '../index/catalog-store.js';
import type { AgentListing, AgentsQuery, AgentsListResponse } from '../domain/registry.schema.js';

function encodeToken(offset: number): string {
  return Buffer.from(`offset:${offset}`, 'utf8').toString('base64url');
}
function decodeToken(token: string | undefined): number {
  if (!token) return 0;
  const m = /^offset:(\d+)$/.exec(Buffer.from(token, 'base64url').toString('utf8'));
  const n = m ? Number(m[1]) : 0;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Sort comparators for the optional `orderBy` parameter (deterministic browsing). */
function comparator(orderBy: string | undefined): (a: AgentListing, b: AgentListing) => number {
  const [fieldRaw, dirRaw] = (orderBy ?? 'name').trim().split(/\s+/);
  const dir = dirRaw?.toLowerCase() === 'desc' ? -1 : 1;
  const field = fieldRaw === 'name' ? 'displayName' : (fieldRaw ?? 'displayName');
  return (a, b) => {
    const av = String((a as Record<string, unknown>)[field] ?? a.identifier);
    const bv = String((b as Record<string, unknown>)[field] ?? b.identifier);
    return av.localeCompare(bv) * dir;
  };
}

/**
 * GET /agents: deterministic, cacheable listing with ordering + pagination.
 * Optional per spec; returning a paginated `{ items }` object makes it conformant.
 */
export class AgentsService {
  constructor(
    private readonly store: CatalogStore,
    private readonly selfUrl: string,
  ) {}

  list(q: AgentsQuery): AgentsListResponse {
    const all: AgentListing[] = this.store
      .entries()
      .map((entry) => ({ ...entry, source: this.selfUrl }))
      .sort(comparator(q.orderBy));

    const offset = decodeToken(q.pageToken);
    const items = all.slice(offset, offset + q.pageSize);
    const nextOffset = offset + q.pageSize;
    return {
      items,
      total: all.length,
      pageToken: nextOffset < all.length ? encodeToken(nextOffset) : null,
    };
  }
}
