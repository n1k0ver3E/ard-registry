import { z } from 'zod';
import { CatalogEntrySchema, type CatalogEntry } from './catalog.schema.js';

/**
 * Registry REST contract (ard-spec v0.9): POST /search, POST /explore, GET /agents.
 * Field names and shapes follow the spec's OpenAPI/CDDL appendices and are what the
 * official conformance CLI probes for.
 */

/** A discovery query: required natural-language text + optional structured filter. */
export const QuerySchema = z.object({
  text: z.string(),
  filter: z.record(z.array(z.string())).optional(),
});
export type Query = z.infer<typeof QuerySchema>;

export const FederationModeSchema = z.enum(['auto', 'referrals', 'none']);
export type FederationMode = z.infer<typeof FederationModeSchema>;

export const SearchRequestSchema = z.object({
  query: QuerySchema,
  federation: FederationModeSchema.default('none'),
  pageSize: z.number().int().positive().max(100).default(10),
  pageToken: z.string().optional(),
});
export type SearchRequest = z.infer<typeof SearchRequestSchema>;

/** A ranked search hit: the catalog entry plus relevance score and the source registry. */
export const SearchResultItemSchema = CatalogEntrySchema.and(
  z.object({
    score: z.number().int().min(0).max(100),
    source: z.string(),
  }),
);
export type SearchResultItem = z.infer<typeof SearchResultItemSchema>;

export const ReferralSchema = z.object({
  identifier: z.string(),
  displayName: z.string(),
  type: z.string(),
  url: z.string(),
});
export type Referral = z.infer<typeof ReferralSchema>;

export const SearchResponseSchema = z.object({
  results: z.array(SearchResultItemSchema),
  referrals: z.array(ReferralSchema).optional(),
  pageToken: z.string().nullable().optional(),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

/** /explore: facet aggregation request. */
export const ExploreRequestSchema = z.object({
  query: QuerySchema,
  resultType: z
    .object({
      facets: z.array(
        z.object({ field: z.string(), limit: z.number().int().positive().optional() }),
      ),
    })
    .optional(),
});
export type ExploreRequest = z.infer<typeof ExploreRequestSchema>;

export interface FacetBucket {
  value: string;
  count: number;
}
export interface ExploreResponse {
  resultType: 'facets';
  facets: Record<string, { buckets: FacetBucket[]; otherCount: number }>;
}

/** /agents item: a catalog entry annotated with the registry it came from (no score — listing is unranked). */
export type AgentListing = CatalogEntry & { source: string };

export interface AgentsListResponse {
  items: AgentListing[];
  total: number;
  pageToken: string | null;
}

export const AgentsQuerySchema = z.object({
  orderBy: z.string().optional(),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  pageToken: z.string().optional(),
});
export type AgentsQuery = z.infer<typeof AgentsQuerySchema>;
