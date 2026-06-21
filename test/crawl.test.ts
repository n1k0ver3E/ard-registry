import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { writeFile, rm } from 'node:fs/promises';
import { CatalogStore } from '../src/index/catalog-store.js';
import { Crawler } from '../src/crawl/crawler.js';
import { FileSnapshotStore } from '../src/crawl/snapshot.js';
import { parseUrn } from '../src/domain/catalog.schema.js';

const here = resolve(fileURLToPath(import.meta.url), '..');
const cat = (f: string) => resolve(here, `../catalogs/${f}.ai-catalog.json`);
const fixture = (f: string) => resolve(here, `fixtures/${f}`);
const clock = () => '2026-06-20T00:00:00.000Z';

describe('Crawler', () => {
  it('crawls multiple file sources into the store with per-source status', async () => {
    const store = new CatalogStore();
    const crawler = new Crawler(
      store,
      [
        { id: 'mcp', url: cat('cookiy-mcp') },
        { id: 'skill', url: cat('cookiy-skill') },
      ],
      { clock },
    );
    const report = await crawler.crawlOnce();
    expect(store.size).toBe(8); // 5 mcp + 3 skill
    expect(report.sources.every((s) => s.ok)).toBe(true);
    expect(report.sources.find((s) => s.id === 'mcp')!.entryCount).toBe(5);
  });

  it('lenient ingestion indexes a urn:ai (HF-style) entry and skips a broken one', async () => {
    const store = new CatalogStore();
    const crawler = new Crawler(store, [{ id: 'odd', url: fixture('lenient/odd-urn.ai-catalog.json') }], { clock });
    await crawler.crawlOnce();
    const ids = store.entries().map((e) => e.identifier);
    expect(ids).toContain('urn:ai:huggingface.co:registry:discover'); // non-urn:air still indexed
    expect(ids).not.toContain('urn:air:bad.example:x:y'); // no url/data → skipped, not fatal
    expect(store.size).toBe(1);
    // publisher is still extractable from the wild `urn:ai:` form (HF-style)
    expect(parseUrn('urn:ai:huggingface.co:registry:discover')?.publisher).toBe('huggingface.co');
  });

  it('replaceAll drops entries a source no longer advertises', async () => {
    const store = new CatalogStore();
    await new Crawler(store, [{ id: 'x', url: cat('cookiy-mcp') }], { clock }).crawlOnce();
    expect(store.size).toBe(5);
    await new Crawler(store, [{ id: 'x', url: cat('cookiy-skill') }], { clock }).crawlOnce();
    expect(store.size).toBe(3); // stale mcp entries gone
  });

  it('a broken source is skipped; healthy sources still index', async () => {
    const store = new CatalogStore();
    const crawler = new Crawler(
      store,
      [
        { id: 'mcp', url: cat('cookiy-mcp') },
        { id: 'broken', url: fixture('does-not-exist.json') },
      ],
      { clock },
    );
    const report = await crawler.crawlOnce();
    expect(store.size).toBe(5);
    const broken = report.sources.find((s) => s.id === 'broken')!;
    expect(broken.ok).toBe(false);
    expect(broken.error).toBeTruthy();
  });

  it('retains last-good entries when a previously-ok source fails', async () => {
    const tmp = resolve(tmpdir(), 'ard-temp-source.ai-catalog.json');
    await writeFile(
      tmp,
      JSON.stringify({
        specVersion: '1.0',
        entries: [
          {
            identifier: 'urn:air:t.example:x:y',
            displayName: 'T',
            type: 'application/mcp-server-card+json',
            url: 'https://t.example/x.json',
          },
        ],
      }),
    );
    const store = new CatalogStore();
    const crawler = new Crawler(store, [{ id: 't', url: tmp }], { clock });
    await crawler.crawlOnce();
    expect(store.size).toBe(1);

    await rm(tmp);
    const report = await crawler.crawlOnce();
    expect(report.sources[0]!.ok).toBe(false);
    expect(store.size).toBe(1); // last-good retained across a failed cycle
  });

  it('persists to a snapshot and restores without re-crawling', async () => {
    const snapPath = resolve(tmpdir(), 'ard-registry-test-snapshot.json');
    await rm(snapPath, { force: true });
    const snap = new FileSnapshotStore(snapPath);

    const store1 = new CatalogStore();
    await new Crawler(store1, [{ id: 'mcp', url: cat('cookiy-mcp') }], { snapshot: snap, clock }).crawlOnce();

    const store2 = new CatalogStore();
    const crawler2 = new Crawler(store2, [{ id: 'mcp', url: cat('cookiy-mcp') }], { snapshot: snap, clock });
    const loaded = await crawler2.loadSnapshot();
    expect(loaded).toBe(true);
    expect(store2.size).toBe(5); // served from snapshot, no crawl
    await rm(snapPath, { force: true });
  });
});
