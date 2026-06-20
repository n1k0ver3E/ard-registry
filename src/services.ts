import { loadConfig, type RegistryConfig } from './config.js';
import { CatalogStore } from './index/catalog-store.js';
import { Bm25Ranker } from './index/ranker.js';
import { SearchService } from './search/search.service.js';
import { FederationService } from './search/federation.service.js';
import { ExploreService } from './search/explore.service.js';
import { AgentsService } from './search/agents.service.js';
import { buildSelfCatalog } from './discovery/self-catalog.js';
import { Crawler } from './crawl/crawler.js';
import { FileSnapshotStore } from './crawl/snapshot.js';
import { resolveSources } from './crawl/sources.js';
import type { AICatalogManifest } from './domain/catalog.schema.js';

export interface RegistryServices {
  config: RegistryConfig;
  store: CatalogStore;
  crawler: Crawler;
  searchService: SearchService;
  federationService: FederationService;
  exploreService: ExploreService;
  agentsService: AgentsService;
  selfManifest: AICatalogManifest;
}

/**
 * Wire config -> sources -> crawler -> store -> services. The single composition
 * root shared by every surface (HTTP server, CLI, MCP server).
 *
 * The store is populated immediately so one-shot surfaces (CLI/MCP) have data:
 * from the persisted snapshot if present, otherwise by an initial crawl. Long-
 * running surfaces additionally call `crawler.schedule()` to keep it fresh.
 */
export async function createServices(env = process.env): Promise<RegistryServices> {
  const config = loadConfig(env);
  const store = new CatalogStore();
  const ranker = new Bm25Ranker();

  const sources = await resolveSources(config);
  const snapshot = config.snapshotPath ? new FileSnapshotStore(config.snapshotPath) : undefined;
  const crawler = new Crawler(store, sources, { snapshot });

  const fromSnapshot = await crawler.loadSnapshot();
  if (!fromSnapshot || store.size === 0) await crawler.crawlOnce();

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

  return {
    config,
    store,
    crawler,
    searchService,
    federationService,
    exploreService,
    agentsService,
    selfManifest,
  };
}
