import { z } from 'zod';

/**
 * Zod schemas mirroring the official ai-catalog.schema.json (ard-spec v0.9).
 * These are the single source of truth for catalog types across the registry.
 *
 * Design note: structural MUSTs (URN shape, url-XOR-data) are enforced here so a
 * malformed manifest fails fast on load. SHOULD-level rules that the conformance
 * tool treats as *warnings* (e.g. representativeQueries 2..5, non-standard media
 * types) are intentionally NOT enforced here — they live in catalog-validator.ts
 * so loading stays lenient while `pnpm verify:manifest` still surfaces them.
 */

/** Strict URN pattern from the ai-catalog schema: urn:air:<publisher>:<namespace>:<name> */
export const URN_PATTERN = /^urn:air:[a-zA-Z0-9.-]+(:[a-zA-Z0-9._-]+)+$/;

export const AttestationSchema = z
  .object({
    type: z.string(),
    uri: z.string().url(),
    mediaType: z.string(),
    digest: z.string().optional(),
  })
  .strict();
export type Attestation = z.infer<typeof AttestationSchema>;

export const ProvenanceSchema = z
  .object({
    relation: z.enum(['derivedFrom', 'publishedFrom', 'copiedFrom']),
    sourceId: z.string(),
    sourceDigest: z.string().optional(),
  })
  .strict();

export const TrustManifestSchema = z.object({
  identity: z.string(),
  identityType: z.enum(['spiffe', 'did', 'https', 'other']).optional(),
  trustSchema: z.unknown().optional(),
  attestations: z.array(AttestationSchema).optional(),
  provenance: z.array(ProvenanceSchema).optional(),
  signature: z.string().optional(),
});
export type TrustManifest = z.infer<typeof TrustManifestSchema>;

export const CatalogEntrySchema = z
  .object({
    identifier: z.string().regex(URN_PATTERN, {
      message: 'identifier must match urn:air:<publisher>:<namespace>:<agent-name>',
    }),
    displayName: z.string().min(1),
    type: z.string().min(1),
    url: z.string().url().optional(),
    data: z.record(z.unknown()).optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    capabilities: z.array(z.string()).optional(),
    representativeQueries: z.array(z.string()).optional(),
    version: z.string().optional(),
    updatedAt: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
    trustManifest: TrustManifestSchema.optional(),
  })
  .refine((e) => (e.url === undefined) !== (e.data === undefined), {
    message: "entry MUST provide exactly one of 'url' or 'data'",
  });
export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;

export const HostSchema = z.object({
  displayName: z.string().min(1),
  identifier: z.string().optional(),
  documentationUrl: z.string().url().optional(),
  logoUrl: z.string().url().optional(),
  trustManifest: TrustManifestSchema.optional(),
});
export type Host = z.infer<typeof HostSchema>;

export const AICatalogManifestSchema = z.object({
  specVersion: z.literal('1.0'),
  host: HostSchema.optional(),
  entries: z.array(CatalogEntrySchema),
});
export type AICatalogManifest = z.infer<typeof AICatalogManifestSchema>;

/** Standard discovery media types (conformance warns on anything outside this set). */
export const STANDARD_MEDIA_TYPES = [
  'application/ai-catalog+json',
  'application/agent-card+json',
  'application/a2a-agent-card+json',
  'application/mcp-server-card+json',
  'application/agent-skills+zip',
  'application/agent-skills+gzip',
  'text/markdown; profile="urn:air:agent-skills"',
  'application/ai-registry',
  'application/ai-registry+json',
] as const;

/** Media type that marks an entry as a nested sub-catalog to be flattened. */
export const NESTED_CATALOG_TYPE = 'application/ai-catalog+json';

/** Parse the three URN segments (publisher, namespace, name) from an identifier. */
export function parseUrn(
  identifier: string,
): { publisher: string; namespace: string; name: string } | null {
  const m = /^urn:air:([a-zA-Z0-9.-]+):([a-zA-Z0-9._:-]+):([a-zA-Z0-9._-]+)$/.exec(identifier);
  if (!m) {
    // Fall back to a 2-segment form urn:air:<publisher>:<name>
    const m2 = /^urn:air:([a-zA-Z0-9.-]+):([a-zA-Z0-9._-]+)$/.exec(identifier);
    if (!m2) return null;
    return { publisher: m2[1]!, namespace: '', name: m2[2]! };
  }
  return { publisher: m[1]!, namespace: m[2]!, name: m[3]! };
}
