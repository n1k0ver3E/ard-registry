import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Referral } from './domain/registry.schema.js';
import type { CrawlSource } from './crawl/sources.js';

const repoRoot = resolve(fileURLToPath(import.meta.url), '../..');

export interface RegistryConfig {
  host: string;
  port: number;
  /** Mount path for the REST API, e.g. "/api"; probed by `conformance-test registry`. */
  basePath: string;
  /** Directory of ai-catalog.json manifests used as the default crawl source. */
  catalogDir: string;
  /** Inline crawl sources from ARD_SOURCES (JSON), highest precedence. */
  inlineSources?: CrawlSource[];
  /** Path to a JSON sources file (ARD_SOURCES_FILE). */
  sourcesFile?: string;
  /** Path to the JSON snapshot for persistence across restarts (ARD_SNAPSHOT). */
  snapshotPath?: string;
  /** Re-crawl interval in ms for the scheduler (ARD_CRAWL_INTERVAL_MS). */
  crawlIntervalMs: number;
  /** Absolute base URL of this registry, emitted as `source` on results. */
  selfUrl: string;
  /** Publisher FQDN anchoring this registry's own URN identity (must be a real domain in prod). */
  publisher: string;
  /** Upstream registries returned as referrals when federation !== 'none'. */
  upstreams: Referral[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RegistryConfig {
  const host = env.ARD_HOST ?? '127.0.0.1';
  const port = Number(env.ARD_PORT ?? 9010);
  const basePath = env.ARD_BASE_PATH ?? '/api';
  const selfUrl = env.ARD_SELF_URL ?? `http://${host}:${port}${basePath}`;
  const catalogDir = env.ARD_CATALOG_DIR ?? resolve(repoRoot, 'catalogs');
  // RFC 2606 reserved domain by default so the self-URN passes conformance without
  // owning a domain; set ARD_PUBLISHER to your FQDN in production (see urn-naming-guide).
  const publisher = env.ARD_PUBLISHER ?? 'example.com';

  // Upstreams: parsed from ARD_UPSTREAMS (JSON array of referrals) if set, else a
  // seeded public-finder referral so `federation` is demonstrable out of the box.
  let upstreams: Referral[] = [
    {
      identifier: 'urn:air:nlweb.ai:registry:public',
      displayName: 'Public Agent Finder',
      type: 'application/ai-registry+json',
      url: 'https://finder.nlweb.ai/search',
    },
  ];
  if (env.ARD_UPSTREAMS) {
    try {
      const parsed = JSON.parse(env.ARD_UPSTREAMS);
      if (Array.isArray(parsed)) upstreams = parsed as Referral[];
    } catch {
      // Ignore malformed override and keep the default referral.
    }
  }

  let inlineSources: CrawlSource[] | undefined;
  if (env.ARD_SOURCES) {
    try {
      const parsed = JSON.parse(env.ARD_SOURCES);
      if (Array.isArray(parsed)) inlineSources = parsed as CrawlSource[];
    } catch {
      // Ignore malformed override and fall back to file/dir resolution.
    }
  }
  const crawlIntervalMs = Number(env.ARD_CRAWL_INTERVAL_MS ?? 15 * 60 * 1000);

  return {
    host,
    port,
    basePath,
    catalogDir,
    inlineSources,
    sourcesFile: env.ARD_SOURCES_FILE,
    snapshotPath: env.ARD_SNAPSHOT,
    crawlIntervalMs,
    selfUrl,
    publisher,
    upstreams,
  };
}
