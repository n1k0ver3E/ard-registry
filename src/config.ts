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
  /** Upstream registries returned as referrals when federation !== 'none'. */
  upstreams: Referral[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RegistryConfig {
  const host = env.ARD_HOST ?? '127.0.0.1';
  const port = Number(env.ARD_PORT ?? 9010);
  const basePath = env.ARD_BASE_PATH ?? '/api';
  const selfUrl = env.ARD_SELF_URL ?? `http://${host}:${port}${basePath}`;
  const catalogDir = env.ARD_CATALOG_DIR ?? resolve(repoRoot, 'catalogs');

  // A seeded public-finder referral so `federation` is demonstrable out of the box.
  const upstreams: Referral[] = [
    {
      identifier: 'urn:air:nlweb.ai:registry:public',
      displayName: 'Public Agent Finder',
      type: 'application/ai-registry+json',
      url: 'https://finder.nlweb.ai/search',
    },
  ];

  return { host, port, basePath, catalogDir, selfUrl, upstreams };
}
