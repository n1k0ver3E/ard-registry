import { readFile } from 'node:fs/promises';
import { NESTED_CATALOG_TYPE, type AICatalogManifest, type CatalogEntry } from '../domain/catalog.schema.js';
import { validateManifest, type ValidationMode } from './catalog-validator.js';

export interface LoadedEntry {
  entry: CatalogEntry;
  /** Absolute source the entry was indexed from (manifest file path or URL). */
  origin: string;
}

export interface LoadOptions {
  maxDepth?: number;
  visited?: Set<string>;
  /** Validation strictness. Default 'lenient' so crawling tolerates messy manifests. */
  mode?: ValidationMode;
}

/** Read raw manifest text from a local path or http(s) URL. */
export async function fetchManifestText(source: string): Promise<string> {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Failed to fetch manifest ${source}: HTTP ${res.status}`);
    return await res.text();
  }
  return await readFile(source, 'utf8');
}

/**
 * Load and validate a single manifest, returning its flattened entries.
 * Nested sub-catalogs (entries of type application/ai-catalog+json that point at
 * a `url`) are recursively fetched and flattened, with a visited-set guarding
 * against cycles and a depth cap. Validation errors throw.
 */
export async function loadManifest(source: string, opts: LoadOptions = {}): Promise<LoadedEntry[]> {
  const maxDepth = opts.maxDepth ?? 4;
  const visited = opts.visited ?? new Set<string>();
  const mode = opts.mode ?? 'lenient';
  if (visited.has(source)) return [];
  visited.add(source);

  const text = await fetchManifestText(source);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(`Malformed JSON in manifest ${source}: ${(err as Error).message}`);
  }

  const result = validateManifest(raw, source, mode);
  if (!result.ok || !result.manifest) {
    throw new Error(`Invalid manifest ${source}:\n  - ${result.errors.join('\n  - ')}`);
  }

  const out: LoadedEntry[] = [];
  for (const entry of result.manifest.entries) {
    if (entry.type === NESTED_CATALOG_TYPE && entry.url && maxDepth > 0) {
      try {
        const child = await loadManifest(entry.url, { maxDepth: maxDepth - 1, visited, mode });
        out.push(...child);
      } catch {
        // A broken sub-catalog reference should not sink the parent; index the
        // pointer entry itself so it remains discoverable.
        out.push({ entry, origin: source });
      }
    } else {
      out.push({ entry, origin: source });
    }
  }
  return out;
}

export type { AICatalogManifest };
