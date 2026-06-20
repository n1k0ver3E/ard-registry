import { parseUrn, type CatalogEntry } from '../domain/catalog.schema.js';

export interface ScoredEntry {
  entry: CatalogEntry;
  /** Relevance score normalized to an integer in [0, 100] (per ard-spec). */
  score: number;
}

/**
 * A relevance ranker. The registry depends only on this interface, so the lexical
 * BM25 implementation below can later be swapped for an embedding-based ranker
 * without touching the search service.
 */
export interface Ranker {
  rank(queryText: string, entries: CatalogEntry[]): ScoredEntry[];
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how', 'in', 'is', 'it',
  'me', 'my', 'of', 'on', 'or', 'that', 'the', 'to', 'with', 'i', 'want', 'need',
]);

/** Lowercase, split camelCase, then split on non-alphanumeric; drop stopwords. */
export function tokenize(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** The searchable document for an entry: all human/semantic signal concatenated. */
export function entryDocument(entry: CatalogEntry): string {
  const parts: string[] = [entry.displayName, entry.description ?? ''];
  if (entry.capabilities) parts.push(entry.capabilities.join(' '));
  if (entry.representativeQueries) parts.push(entry.representativeQueries.join(' '));
  if (entry.tags) parts.push(entry.tags.join(' '));
  const urn = parseUrn(entry.identifier);
  if (urn) parts.push(`${urn.namespace} ${urn.name}`);
  return parts.join(' ');
}

const K1 = 1.5;
const B = 0.75;

/**
 * BM25 lexical ranker. Corpus statistics (df, avgdl) are computed over the
 * candidate set passed in, so scores reflect relevance within the filtered slice.
 * Raw BM25 scores are normalized to [0,100] relative to the top hit; entries with
 * no term overlap (raw 0) are returned with score 0 and dropped by the caller.
 */
export class Bm25Ranker implements Ranker {
  rank(queryText: string, entries: CatalogEntry[]): ScoredEntry[] {
    const queryTerms = tokenize(queryText);
    if (entries.length === 0 || queryTerms.length === 0) {
      return entries.map((entry) => ({ entry, score: 0 }));
    }

    const docs = entries.map((entry) => tokenize(entryDocument(entry)));
    const N = docs.length;
    const avgdl = docs.reduce((s, d) => s + d.length, 0) / N || 1;

    const uniqueQueryTerms = [...new Set(queryTerms)];
    const df = new Map<string, number>();
    for (const term of uniqueQueryTerms) {
      df.set(term, docs.filter((d) => d.includes(term)).length);
    }
    const idf = (term: string): number => {
      const n = df.get(term) ?? 0;
      return Math.log(1 + (N - n + 0.5) / (n + 0.5));
    };

    const raw = docs.map((doc) => {
      const dl = doc.length;
      const tf = new Map<string, number>();
      for (const t of doc) tf.set(t, (tf.get(t) ?? 0) + 1);
      let score = 0;
      for (const term of uniqueQueryTerms) {
        const f = tf.get(term) ?? 0;
        if (f === 0) continue;
        score += idf(term) * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * dl) / avgdl)));
      }
      return score;
    });

    const maxRaw = Math.max(...raw);
    return entries.map((entry, i) => {
      const r = raw[i] ?? 0;
      const score = maxRaw > 0 && r > 0 ? Math.max(1, Math.round((100 * r) / maxRaw)) : 0;
      return { entry, score };
    });
  }
}
