import { buildServer } from './http/server.js';
import { createServices } from './services.js';

/** Wire services -> HTTP server. Exported for tests (no listen, no scheduler). */
export async function createApp(env = process.env) {
  const services = await createServices(env);
  const { config, store } = services;

  const app = buildServer({
    basePath: config.basePath,
    entryCount: store.size,
    federationService: services.federationService,
    exploreService: services.exploreService,
    agentsService: services.agentsService,
    selfManifest: services.selfManifest,
    crawlStatus: () => services.crawler.getStatus(),
  });
  return { app, config, store, crawler: services.crawler };
}

async function main(): Promise<void> {
  const { app, config, store, crawler } = await createApp();
  // Keep the index fresh: re-crawl all sources on the configured interval.
  crawler.schedule(config.crawlIntervalMs);
  await app.listen({ host: config.host, port: config.port });
  // eslint-disable-next-line no-console
  console.log(
    `ard-registry listening on http://${config.host}:${config.port}${config.basePath} ` +
      `(${store.size} entries, ${crawler.getStatus().length} sources, ` +
      `re-crawl every ${Math.round(config.crawlIntervalMs / 1000)}s)`,
  );
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      crawler.stop();
      void app.close().then(() => process.exit(0));
    });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
