import { createApp } from '../src/main.js';
import { loadConfig } from '../src/config.js';
import { runConformanceAsync } from './conformance.js';

/**
 * Boot the real registry on an ephemeral-ish port and run the official
 * `conformance-test registry` probe against it. Exits 0 only if the probe PASSes.
 */
async function main(): Promise<void> {
  const port = Number(process.env.ARD_PORT ?? 9011);
  const host = '127.0.0.1';
  const basePath = '/api';
  const env = { ...process.env, ARD_PORT: String(port), ARD_HOST: host, ARD_BASE_PATH: basePath };

  const { app, store } = await createApp(env);
  await app.listen({ host, port });
  const base = `http://${host}:${port}${basePath}`;
  console.log(`\nBooted ard-registry at ${base} (${store.size} entries). Probing...\n`);

  loadConfig(env); // validate config resolves
  const { ok, stdout } = await runConformanceAsync('registry', base);
  process.stdout.write(stdout);

  await app.close();

  console.log('\n' + '='.repeat(60));
  console.log(ok ? '✅ REGISTRY CONFORMANT (exit 0)' : '❌ REGISTRY FAILED CONFORMANCE');
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
