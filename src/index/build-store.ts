import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CatalogStore } from './catalog-store.js';
import { loadManifest } from '../ingest/manifest-loader.js';

/** Crawl every *.json manifest in a directory into a fresh CatalogStore. */
export async function buildStoreFromDir(catalogDir: string): Promise<CatalogStore> {
  const files = (await readdir(catalogDir)).filter((f) => f.endsWith('.json')).sort();
  const store = new CatalogStore();
  for (const file of files) {
    store.add(await loadManifest(resolve(catalogDir, file)));
  }
  return store;
}
