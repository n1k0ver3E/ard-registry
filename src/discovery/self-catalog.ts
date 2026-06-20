import type { AICatalogManifest } from '../domain/catalog.schema.js';

export interface SelfCatalogInput {
  publisher: string;
  selfUrl: string;
  entryCount: number;
}

/**
 * Build this registry's own `/.well-known/ai-catalog.json` — it advertises the
 * registry as an `application/ai-registry+json` resource so peers and clients can
 * discover (and federate with) it. The URN is anchored to the publisher FQDN while
 * the physical `url` points at the live search endpoint (identity ≠ location).
 */
export function buildSelfCatalog(input: SelfCatalogInput): AICatalogManifest {
  return {
    specVersion: '1.0',
    host: {
      displayName: 'ard-registry',
      identifier: `did:web:${input.publisher}`,
      documentationUrl: 'https://agenticresourcediscovery.org/spec/',
    },
    entries: [
      {
        identifier: `urn:air:${input.publisher}:registry:search`,
        displayName: 'ard-registry discovery service',
        type: 'application/ai-registry+json',
        url: `${input.selfUrl}/search`,
        description:
          `ARD discovery registry indexing ${input.entryCount} agentic resources ` +
          `(MCP servers, agent skills, CLIs). POST a natural-language query to discover ` +
          `and verify resources before invocation.`,
        capabilities: ['search', 'explore', 'agents', 'federation'],
        representativeQueries: [
          'discover an MCP server for a task',
          'find an agent skill to plan user research',
          'what resources can run AI-moderated interviews',
        ],
        tags: ['registry', 'discovery', 'ard'],
      },
    ],
  };
}
