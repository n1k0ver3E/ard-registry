/** Maps a human-friendly resource "kind" to its ARD media type, for filter sugar. */
export const KIND_TO_TYPE: Record<string, string> = {
  mcp: 'application/mcp-server-card+json',
  skill: 'text/markdown; profile="urn:air:agent-skills"',
  cli: 'application/x-cli+json',
  agent: 'application/a2a-agent-card+json',
};

export const KINDS = Object.keys(KIND_TO_TYPE) as Array<keyof typeof KIND_TO_TYPE>;

/** Build a `{ type: [...] }` filter from a kind, or undefined if the kind is unknown. */
export function kindFilter(kind: string | undefined): { type: string[] } | undefined {
  if (!kind) return undefined;
  const type = KIND_TO_TYPE[kind];
  return type ? { type: [type] } : undefined;
}
