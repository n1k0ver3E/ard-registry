import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Referral } from './domain/registry.schema.js';

const repoRoot = resolve(fileURLToPath(import.meta.url), '../..');

export interface RegistryConfig {
  host: string;
  port: number;
  /** Mount path for the REST API, e.g. "/api"; probed by `conformance-test registry`. */
  basePath: string;
  /** Directory of ai-catalog.json manifests to crawl on boot. */
  catalogDir: string;
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

  return { host, port, basePath, catalogDir, selfUrl, publisher, upstreams };
}
