import {
  CatalogEntrySchema,
  LenientCatalogEntrySchema,
  STANDARD_MEDIA_TYPES,
  URN_PATTERN,
  type AICatalogManifest,
  type CatalogEntry,
} from '../domain/catalog.schema.js';

export type ValidationMode = 'strict' | 'lenient';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  manifest?: AICatalogManifest;
}

/**
 * Validate a raw manifest. Two modes:
 *  - `strict`  (default): mirrors the official conformance CLI — URN-format and a
 *    missing trust identity are hard errors; a bad entry fails the manifest.
 *  - `lenient`: tolerant ingestion for crawled third-party manifests — unusable
 *    entries are skipped, and policy issues (non-`urn:air:` ids like HF's `urn:ai:`,
 *    non-standard media types) become warnings. Only a structurally broken root
 *    (not JSON object / no entries array) is fatal.
 */
export function validateManifest(
  raw: unknown,
  sourceLabel = '<manifest>',
  mode: ValidationMode = 'strict',
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fail = (msg: string) => (mode === 'strict' ? errors : warnings).push(msg);

  if (typeof raw !== 'object' || raw === null) {
    errors.push(`[${sourceLabel}] manifest is not a JSON object.`);
    return { ok: false, errors, warnings };
  }
  const root = raw as Record<string, unknown>;

  if (root.specVersion !== '1.0') {
    warnings.push(`[${sourceLabel}] specVersion is '${String(root.specVersion)}', expected '1.0'.`);
  }
  if ('collections' in root) {
    fail(`[${sourceLabel}] deprecated 'collections' root property (ADR-0003): use nested entries.`);
  }
  if (!Array.isArray(root.entries)) {
    errors.push(`[${sourceLabel}] missing required 'entries' array.`); // always fatal
    return { ok: false, errors, warnings };
  }

  const entrySchema = mode === 'strict' ? CatalogEntrySchema : LenientCatalogEntrySchema;
  const goodEntries: CatalogEntry[] = [];

  root.entries.forEach((rawEntry, idx) => {
    const parsed = entrySchema.safeParse(rawEntry);
    if (!parsed.success) {
      const label =
        (rawEntry as { displayName?: string })?.displayName ??
        (rawEntry as { identifier?: string })?.identifier ??
        `Entry #${idx}`;
      const msg = `[${label}] invalid entry: ${parsed.error.issues[0]?.message ?? 'unknown'}`;
      if (mode === 'strict') errors.push(msg);
      else warnings.push(`${msg} (skipped)`);
      return;
    }
    const entry = parsed.data as CatalogEntry;
    const label = entry.displayName || entry.identifier;

    if (!URN_PATTERN.test(entry.identifier)) {
      fail(`[${label}] identifier '${entry.identifier}' does not match urn:air:<publisher>:<ns>:<name>.`);
    }
    if (!STANDARD_MEDIA_TYPES.includes(entry.type as (typeof STANDARD_MEDIA_TYPES)[number])) {
      warnings.push(`[${label}] non-standard media type '${entry.type}' (advisory).`);
    }
    const q = entry.representativeQueries;
    if (q && (q.length < 2 || q.length > 5)) {
      warnings.push(`[${label}] representativeQueries has ${q.length} items; 2..5 recommended.`);
    }
    if (entry.trustManifest && !entry.trustManifest.identity) {
      fail(`[${label}] trustManifest is missing required 'identity'.`);
    }

    goodEntries.push(entry);
  });

  const manifest: AICatalogManifest = {
    specVersion: '1.0',
    host: (root.host as AICatalogManifest['host']) ?? undefined,
    entries: goodEntries,
  };
  return { ok: errors.length === 0, errors, warnings, manifest };
}
