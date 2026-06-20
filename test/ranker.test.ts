import { describe, it, expect, beforeAll } from 'vitest';
import { Bm25Ranker, tokenize } from '../src/index/ranker.js';
import { buildStore, tail } from './helpers.js';
import type { CatalogEntry } from '../src/domain/catalog.schema.js';

describe('tokenize', () => {
  it('splits snake_case tool names into searchable terms', () => {
    expect(tokenize('cookiy_study_create')).toEqual(['cookiy', 'study', 'create']);
  });
  it('drops stopwords and 1-char tokens', () => {
    expect(tokenize('run a study with me')).toEqual(['run', 'study']);
  });
});

describe('Bm25Ranker over real cookiy catalogs', () => {
  let entries: CatalogEntry[];
  const ranker = new Bm25Ranker();
  const top = (q: string) =>
    tail(
      ranker
        .rank(q, entries)
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)[0]!.entry.identifier,
    );

  beforeAll(async () => {
    entries = (await buildStore()).entries();
  });

  it('ranks the recruit/interview MCP first for an interview query', () => {
    expect(top('recruit participants and run AI-moderated interviews')).toBe(
      'recruit-and-interview',
    );
  });

  it('ranks the billing MCP first for a wallet query', () => {
    expect(top('check my wallet balance and top up')).toBe('billing');
  });

  it('ranks the quant-survey MCP first for a survey query', () => {
    expect(top('design and distribute a multilingual quantitative survey')).toBe('quant-survey');
  });

  it('scores are integers within [0, 100] and the top hit is 100', () => {
    const scored = ranker
      .rank('synthesize interview transcripts into a research report', entries)
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
    expect(scored.length).toBeGreaterThan(0);
    for (const s of scored) {
      expect(Number.isInteger(s.score)).toBe(true);
      expect(s.score).toBeGreaterThanOrEqual(1);
      expect(s.score).toBeLessThanOrEqual(100);
    }
    expect(scored[0]!.score).toBe(100);
  });

  it('returns no positive hits for a query unrelated to any resource', () => {
    const hits = ranker.rank('photosynthesis in marine algae', entries).filter((r) => r.score > 0);
    expect(hits).toHaveLength(0);
  });
});
