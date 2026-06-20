import { resolve } from 'node:path';
import { createServices } from '../src/services.js';
import { SearchRequestSchema } from '../src/domain/registry.schema.js';
import { REPO_ROOT } from './conformance.js';

/**
 * Live crawl verification: crawl the configured sources (local cookiy catalogs +
 * Hugging Face's PUBLIC ai-catalog.json) into a persisted snapshot, then prove the
 * external HF resources are now discoverable. Exercises real network + lenient
 * ingestion (HF uses `urn:ai:` not `urn:air:`).
 */
async function main(): Promise<void> {
  const env = {
    ...process.env,
    ARD_SOURCES_FILE: resolve(REPO_ROOT, 'sources.json'),
    ARD_SNAPSHOT: resolve(REPO_ROOT, '.cache/catalog-snapshot.json'),
  };

  const { crawler, federationService } = await createServices(env);
  // Force a fresh crawl (createServices may have served from snapshot) to show live status.
  const report = await crawler.crawlOnce();

  console.log(`\nCrawled ${report.total} entries from ${report.sources.length} sources:\n`);
  for (const s of report.sources) {
    const mark = s.ok ? '✓' : '✗';
    console.log(`  ${mark} ${s.id.padEnd(14)} ${String(s.entryCount).padStart(3)} entries  ${s.url}`);
    if (s.error) console.log(`      error: ${s.error}`);
  }

  const hf = report.sources.find((s) => s.id === 'huggingface');
  const res = await federationService.search(
    SearchRequestSchema.parse({ query: { text: 'hugging face registry search spaces' }, pageSize: 3 }),
  );
  console.log(`\nDiscover "hugging face registry" → ${res.results.length} hit(s):`);
  for (const r of res.results) console.log(`  [${r.score}] ${r.displayName}  (${r.identifier})`);

  const indexedHfExternally =
    !!hf?.ok && res.results.some((r) => r.identifier.startsWith('urn:ai:huggingface.co'));

  console.log('\n' + '='.repeat(60));
  if (indexedHfExternally) {
    console.log('✅ CRAWLED A REAL EXTERNAL SOURCE: HF resources indexed & discoverable');
    process.exit(0);
  } else {
    console.log('❌ HF external source not indexed (network down? schema drift?)');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
