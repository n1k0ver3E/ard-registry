import { parseUrn, type CatalogEntry } from '../domain/catalog.schema.js';

/** Resolve the string values of a (possibly dotted) filter field on an entry. */
export function fieldValues(entry: CatalogEntry, key: string): string[] {
  switch (key) {
    case 'type':
      return [entry.type];
    case 'tags':
      return entry.tags ?? [];
    case 'capabilities':
      return entry.capabilities ?? [];
    case 'publisher': {
      const urn = parseUrn(entry.identifier);
      return urn ? [urn.publisher] : [];
    }
    case 'trustManifest.identityType':
      return entry.trustManifest?.identityType ? [entry.trustManifest.identityType] : [];
    case 'trustManifest.attestations.type':
      return entry.trustManifest?.attestations?.map((a) => a.type) ?? [];
    default: {
      // Generic top-level fallback for string or string[] fields.
      const v = (entry as Record<string, unknown>)[key];
      if (typeof v === 'string') return [v];
      if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
      return [];
    }
  }
}

/**
 * Filter semantics from the spec: AND across keys, OR within a key's values.
 * An entry matches iff, for every filter key, at least one of its values is present
 * in the entry's resolved values for that key.
 */
export function matchesFilter(
  entry: CatalogEntry,
  filter: Record<string, string[]> | undefined,
): boolean {
  if (!filter) return true;
  for (const [key, wanted] of Object.entries(filter)) {
    if (wanted.length === 0) continue;
    const have = new Set(fieldValues(entry, key));
    if (!wanted.some((w) => have.has(w))) return false;
  }
  return true;
}
