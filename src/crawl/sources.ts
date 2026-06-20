import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

/** A manifest the crawler fetches: a publisher's ai-catalog.json (file path or URL). */
export interface CrawlSource {
  id: string;
  /** Absolute file path or http(s) URL of the ai-catalog.json. */
  url: string;
  label?: string;
  /** True for internal/first-party sources (informational; affects nothing yet). */
  internal?: boolean;
}

export interface SourceConfig {
  catalogDir: string;
  /** Inline sources from ARD_SOURCES (JSON array), highest precedence. */
  inlineSources?: CrawlSource[];
  /** Path to a JSON file listing sources, e.g. sources.json. */
  sourcesFile?: string;
}

/**
 * Resolve the crawl source set, in precedence order:
 *   1. ARD_SOURCES inline JSON, else
 *   2. a sources file (ARD_SOURCES_FILE), else
 *   3. fall back to scanning the local catalogs/ dir (offline default, back-compat).
 */
export async function resolveSources(config: SourceConfig): Promise<CrawlSource[]> {
  if (config.inlineSources?.length) return config.inlineSources;

  if (config.sourcesFile) {
    const text = await readFile(config.sourcesFile, 'utf8');
    const parsed = JSON.parse(text) as { sources?: CrawlSource[] } | CrawlSource[];
    const list = Array.isArray(parsed) ? parsed : (parsed.sources ?? []);
    // Resolve relative file urls against the sources file's directory.
    const baseDir = resolve(config.sourcesFile, '..');
    return list.map((s) => ({
      ...s,
      url: /^(https?|file):/.test(s.url) ? s.url : resolve(baseDir, s.url),
    }));
  }

  const files = (await readdir(config.catalogDir)).filter((f) => f.endsWith('.json')).sort();
  return files.map((f) => ({
    id: f.replace(/\.ai-catalog\.json$|\.json$/, ''),
    url: resolve(config.catalogDir, f),
    label: f,
    internal: true,
  }));
}
