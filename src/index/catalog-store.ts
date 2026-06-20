import type { CatalogEntry } from '../domain/catalog.schema.js';
import type { LoadedEntry } from '../ingest/manifest-loader.js';

/**
 * In-memory index of catalog entries. Deduplicates by identifier (last write wins),
 * since the same logical resource may be advertised by more than one crawled manifest.
 */
export class CatalogStore {
  private readonly byId = new Map<string, LoadedEntry>();

  add(entries: LoadedEntry[]): void {
    for (const e of entries) this.byId.set(e.entry.identifier, e);
  }

  /** Atomically replace the entire index (used after a crawl cycle). */
  replaceAll(entries: LoadedEntry[]): void {
    this.byId.clear();
    this.add(entries);
  }

  all(): LoadedEntry[] {
    return [...this.byId.values()];
  }

  entries(): CatalogEntry[] {
    return this.all().map((e) => e.entry);
  }

  get size(): number {
    return this.byId.size;
  }
}
