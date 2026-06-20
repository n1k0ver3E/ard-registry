import {
  AICatalogManifestSchema,
  STANDARD_MEDIA_TYPES,
  URN_PATTERN,
  type AICatalogManifest,
} from '../domain/catalog.schema.js';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  manifest?: AICatalogManifest;
}

/**
 * Validate a raw manifest object against the ai-catalog spec, mirroring the
 * official conformance CLI's split between hard errors (fail) and warnings
 * (advisory). `ok` is true iff there are zero errors — same contract as the CLI.
 */
export function validateManifest(raw: unknown, sourceLabel = '<manifest>'): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const parsed = AICatalogManifestSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.');
      errors.push(`[${sourceLabel}] ${path ? path + ': ' : ''}${issue.message}`);
    }
    return { ok: false, errors, warnings };
  }

  const manifest = parsed.data;

  // Deprecated top-level `collections` (removed in ADR-0003).
  if (typeof raw === 'object' && raw !== null && 'collections' in raw) {
    errors.push(
      `[${sourceLabel}] Deprecated 'collections' root property found; model hierarchies via entries with type application/ai-catalog+json (ADR-0003).`,
    );
  }

  manifest.entries.forEach((entry, idx) => {
    const label = entry.displayName || entry.identifier || `Entry #${idx}`;

    if (!URN_PATTERN.test(entry.identifier)) {
      errors.push(`[${label}] identifier '${entry.identifier}' does not match the URN pattern.`);
    }

    if (!STANDARD_MEDIA_TYPES.includes(entry.type as (typeof STANDARD_MEDIA_TYPES)[number])) {
      warnings.push(
        `[${label}] media type '${entry.type}' is not one of the standard discovery types (advisory).`,
      );
    }

    const q = entry.representativeQueries;
    if (q && (q.length < 2 || q.length > 5)) {
      warnings.push(
        `[${label}] representativeQueries has ${q.length} items; 2..5 recommended for good embeddings.`,
      );
    }

    if (entry.trustManifest && !entry.trustManifest.identity) {
      errors.push(`[${label}] trustManifest is missing required 'identity'.`);
    }
  });

  return { ok: errors.length === 0, errors, warnings, manifest };
}
