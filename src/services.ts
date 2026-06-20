import { loadConfig, type RegistryConfig } from './config.js';
import { buildStoreFromDir } from './index/build-store.js';
import { Bm25Ranker } from './index/ranker.js';
import { SearchService } from './search/search.service.js';
import { FederationService } from './search/federation.service.js';
import { ExploreService } from './search/explore.service.js';
import { AgentsService } from './search/agents.service.js';
import { buildSelfCatalog } from './discovery/self-catalog.js';
import type { CatalogStore } from './index/catalog-store.js';
import type { AICatalogManifest } from './domain/catalog.schema.js';

export interface RegistryServices {
  config: RegistryConfig;
  store: CatalogStore;
  searchService: SearchService;
  federationService: FederationService;
  exploreService: ExploreService;
  agentsService: AgentsService;
  selfManifest: AICatalogManifest;
}

/**
 * Wire config -> store -> services. The single composition root shared by every
 * surface (HTTP server, CLI, MCP server), so none of them re-implement search.
 */
export async function createServices(env = process.env): Promise<RegistryServices> {
  const config = loadConfig(env);
  const store = await buildStoreFromDir(config.catalogDir);
  const ranker = new Bm25Ranker();

  const searchService = new SearchService(store, ranker, { selfUrl: config.selfUrl });
  const federationService = new FederationService(searchService, {
    selfUrl: config.selfUrl,
    upstreams: config.upstreams,
  });
  const exploreService = new ExploreService(store, ranker);
  const agentsService = new AgentsService(store, config.selfUrl);
  const selfManifest = buildSelfCatalog({
    publisher: config.publisher,
    selfUrl: config.selfUrl,
    entryCount: store.size,
  });

  return { config, store, searchService, federationService, exploreService, agentsService, selfManifest };
}
