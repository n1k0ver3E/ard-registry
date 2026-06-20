import { buildServer } from './http/server.js';
import { createServices } from './services.js';

/** Wire services -> HTTP server. Exported for tests (no listen). */
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
