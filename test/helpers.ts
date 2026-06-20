import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogStore } from '../src/index/catalog-store.js';
import { loadManifest } from '../src/ingest/manifest-loader.js';

const here = resolve(fileURLToPath(import.meta.url), '..');
export const CATALOG_FILES = ['cookiy-mcp', 'cookiy-skill', 'cookiy-cli'].map((f) =>
  resolve(here, `../catalogs/${f}.ai-catalog.json`),
);

/** Build a CatalogStore loaded with all real cookiy catalogs (9 entries). */
export async function buildStore(): Promise<CatalogStore> {
  const store = new CatalogStore();
  for (const file of CATALOG_FILES) {
    store.add(await loadManifest(file));
  }
  return store;
}

/** Short tail of a urn:air:...:<name> identifier, for readable assertions. */
export const tail = (identifier: string): string => identifier.split(':').pop() ?? identifier;
