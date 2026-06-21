import type { CatalogStore } from '../index/catalog-store.js';
import { loadManifest, type LoadedEntry } from '../ingest/manifest-loader.js';
import type { SnapshotStore } from './snapshot.js';
import type { CrawlSource } from './sources.js';

export interface SourceStatus {
  id: string;
  url: string;
  ok: boolean;
  entryCount: number;
  lastCrawlAt: string | null;
  error?: string;
}

export interface CrawlReport {
  crawledAt: string;
  total: number;
  sources: SourceStatus[];
}

/** Wall-clock provider, injectable so tests stay deterministic. */
export type Clock = () => string;
const systemClock: Clock = () => new Date().toISOString();

/**
 * Periodically crawls a configured set of manifest sources into the store.
 * Each source keeps its last *successful* entry set, so a source that is briefly
 * unreachable does not drop out of the index. After every cycle the union is
 * swapped into the store atomically and persisted to the snapshot store.
 */
export class Crawler {
  private readonly lastGood = new Map<string, LoadedEntry[]>();
  private readonly status = new Map<string, SourceStatus>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly store: CatalogStore,
    private readonly sources: CrawlSource[],
    private readonly opts: { snapshot?: SnapshotStore; clock?: Clock } = {},
  ) {
    for (const s of sources) {
      this.status.set(s.id, { id: s.id, url: s.url, ok: false, entryCount: 0, lastCrawlAt: null });
    }
  }

  private get clock(): Clock {
    return this.opts.clock ?? systemClock;
  }

  /** Seed the store (and per-source last-good) from a persisted snapshot, if any. */
  async loadSnapshot(): Promise<boolean> {
    const snap = await this.opts.snapshot?.load();
    if (!snap?.entries.length) return false;
    this.store.replaceAll(snap.entries);
    for (const s of this.sources) {
      const owned = snap.entries.filter((e) => e.origin === s.url);
      if (owned.length) {
        this.lastGood.set(s.id, owned);
        // Reflect snapshot counts in status so /sources isn't blank before a re-crawl.
        this.status.set(s.id, {
          id: s.id,
          url: s.url,
          ok: true,
          entryCount: owned.length,
          lastCrawlAt: snap.crawledAt,
        });
      }
    }
    return true;
  }

  /** Run one crawl cycle across all sources; returns a per-source report. */
  async crawlOnce(): Promise<CrawlReport> {
    const at = this.clock();
    await Promise.all(
      this.sources.map(async (source) => {
        try {
          const entries = await loadManifest(source.url, { mode: 'lenient' });
          this.lastGood.set(source.id, entries);
          this.status.set(source.id, {
            id: source.id,
            url: source.url,
            ok: true,
            entryCount: entries.length,
            lastCrawlAt: at,
          });
        } catch (err) {
          const kept = this.lastGood.get(source.id)?.length ?? 0;
          this.status.set(source.id, {
            id: source.id,
            url: source.url,
            ok: false,
            entryCount: kept,
            lastCrawlAt: at,
            error: (err as Error).message,
          });
        }
      }),
    );

    const union = [...this.lastGood.values()].flat();
    this.store.replaceAll(union);
    await this.opts.snapshot?.save({ crawledAt: at, entries: union });

    return { crawledAt: at, total: this.store.size, sources: this.getStatus() };
  }

  /** Re-crawl on an interval (assumes the store is already populated). Returns a stop fn. */
  schedule(intervalMs: number): () => void {
    this.stop();
    this.timer = setInterval(() => {
      void this.crawlOnce().catch(() => {});
    }, intervalMs);
    this.timer.unref?.(); // don't keep the process alive just for the timer
    return () => this.stop();
  }

  /** Standalone: load snapshot, crawl once now, then schedule. Returns a stop fn. */
  async start(intervalMs: number): Promise<() => void> {
    await this.loadSnapshot();
    await this.crawlOnce();
    return this.schedule(intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getStatus(): SourceStatus[] {
    return [...this.status.values()];
  }
}
