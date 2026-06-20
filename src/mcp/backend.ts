import type {
  ExploreRequest,
  ExploreResponse,
  SearchRequest,
  SearchResponse,
} from '../domain/registry.schema.js';
import type { RegistryServices } from '../services.js';

/**
 * What the MCP discovery tools call. Lets the MCP server run either in-process
 * (reusing the registry's services) or as a thin proxy over a remote registry,
 * without the tool layer caring which.
 */
export interface DiscoveryBackend {
  label: string;
  search(req: SearchRequest): Promise<SearchResponse>;
  explore(req: ExploreRequest): Promise<ExploreResponse>;
}

/** In-process backend: reuses the very same services the HTTP server uses. */
export function localBackend(services: RegistryServices): DiscoveryBackend {
  return {
    label: `in-process (${services.store.size} entries from ${services.config.catalogDir})`,
    search: (req) => services.federationService.search(req),
    explore: (req) => Promise.resolve(services.exploreService.explore(req)),
  };
}

/** Remote backend: proxies to a running registry's REST endpoints. */
export function httpBackend(baseUrl: string): DiscoveryBackend {
  const base = baseUrl.replace(/\/$/, '');
  const post = async <T>(path: string, body: unknown): Promise<T> => {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`registry ${base}${path} returned HTTP ${res.status}`);
    return (await res.json()) as T;
  };
  return {
    label: `remote ${base}`,
    search: (req) => post<SearchResponse>('/search', req),
    explore: (req) => post<ExploreResponse>('/explore', req),
  };
}
