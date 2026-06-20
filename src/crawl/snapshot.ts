import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { LoadedEntry } from '../ingest/manifest-loader.js';

export interface Snapshot {
  crawledAt: string | null;
  entries: LoadedEntry[];
}

/**
 * Persistence for the crawled index. Swappable interface (file today; sqlite/pg
 * later) so the registry can serve last-known data immediately on restart, before
 * the first crawl of the new process completes.
 */
export interface SnapshotStore {
  load(): Promise<Snapshot | null>;
  save(snapshot: Snapshot): Promise<void>;
}

/** JSON-file snapshot store. Zero-infra persistence good for this scale. */
export class FileSnapshotStore implements SnapshotStore {
  constructor(private readonly path: string) {}

  async load(): Promise<Snapshot | null> {
    try {
      const text = await readFile(this.path, 'utf8');
      const data = JSON.parse(text) as Snapshot;
      if (!Array.isArray(data.entries)) return null;
      return data;
    } catch {
      return null; // missing or corrupt snapshot → start fresh
    }
  }

  async save(snapshot: Snapshot): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(snapshot, null, 2), 'utf8');
  }
}
