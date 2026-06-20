import { loadConfig } from './config.js';
import { buildStoreFromDir } from './index/build-store.js';
import { Bm25Ranker } from './index/ranker.js';
import { SearchService } from './search/search.service.js';
import { ExploreService } from './search/explore.service.js';
import { AgentsService } from './search/agents.service.js';
import { buildServer } from './http/server.js';

/** Wire config -> store -> services -> server. Exported for tests (no listen). */
export async function createApp(env = process.env) {
  const config = loadConfig(env);
  const store = await buildStoreFromDir(config.catalogDir);
  const ranker = new Bm25Ranker();

  const searchService = new SearchService(store, ranker, {
    selfUrl: config.selfUrl,
    upstreams: config.upstreams,
  });
  const exploreService = new ExploreService(store, ranker);
  const agentsService = new AgentsService(store, config.selfUrl);

  const app = buildServer({
    basePath: config.basePath,
    entryCount: store.size,
    searchService,
    exploreService,
    agentsService,
  });
  return { app, config, store };
}

async function main(): Promise<void> {
  const { app, config, store } = await createApp();
  await app.listen({ host: config.host, port: config.port });
  // eslint-disable-next-line no-console
  console.log(
    `ard-registry listening on http://${config.host}:${config.port}${config.basePath} ` +
      `(${store.size} entries indexed from ${config.catalogDir})`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
