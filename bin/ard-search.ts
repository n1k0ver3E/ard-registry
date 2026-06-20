#!/usr/bin/env tsx
import { loadConfig } from '../src/config.js';
import { buildStoreFromDir } from '../src/index/build-store.js';
import { Bm25Ranker } from '../src/index/ranker.js';
import { SearchService } from '../src/search/search.service.js';
import { SearchRequestSchema, type SearchResponse } from '../src/domain/registry.schema.js';

const KIND_TO_TYPE: Record<string, string> = {
  mcp: 'application/mcp-server-card+json',
  skill: 'text/markdown; profile="urn:air:agent-skills"',
  cli: 'application/x-cli+json',
  agent: 'application/a2a-agent-card+json',
};

interface Args {
  query: string;
  kind?: string;
  json: boolean;
  federation: 'auto' | 'referrals' | 'none';
  limit: number;
  url?: string;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const out: Args = { query: '', json: false, federation: 'none', limit: 10 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--json') out.json = true;
    else if (a === '--kind') out.kind = argv[++i];
    else if (a === '--federation') out.federation = argv[++i] as Args['federation'];
    else if (a === '--limit') out.limit = Number(argv[++i]);
    else if (a === '--url') out.url = argv[++i];
    else positional.push(a);
  }
  out.query = positional.join(' ');
  return out;
}

async function runSearch(args: Args): Promise<SearchResponse> {
  const filter = args.kind && KIND_TO_TYPE[args.kind] ? { type: [KIND_TO_TYPE[args.kind]!] } : undefined;
  const req = SearchRequestSchema.parse({
    query: { text: args.query, ...(filter ? { filter } : {}) },
    federation: args.federation,
    pageSize: args.limit,
  });

  if (args.url) {
    const res = await fetch(`${args.url.replace(/\/$/, '')}/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(`registry ${args.url} returned HTTP ${res.status}`);
    return (await res.json()) as SearchResponse;
  }

  const config = loadConfig();
  const store = await buildStoreFromDir(config.catalogDir);
  const service = new SearchService(store, new Bm25Ranker(), {
    selfUrl: config.selfUrl,
    upstreams: config.upstreams,
  });
  return service.search(req);
}

function render(res: SearchResponse, args: Args): void {
  if (args.json) {
    console.log(JSON.stringify(res, null, 2));
    return;
  }
  console.log(`\n🔎  "${args.query}"${args.kind ? `  [kind=${args.kind}]` : ''}\n`);
  if (res.results.length === 0) {
    console.log('  (no matching resources)\n');
  }
  res.results.forEach((r, i) => {
    const bar = '█'.repeat(Math.round(r.score / 10)).padEnd(10, '░');
    console.log(`  ${String(i + 1).padStart(2)}. [${bar} ${String(r.score).padStart(3)}] ${r.displayName}`);
    console.log(`      ${r.identifier}`);
    console.log(`      ${r.type}`);
    if (r.capabilities?.length) console.log(`      ⚙  ${r.capabilities.slice(0, 6).join(', ')}`);
    console.log(`      → ${'url' in r ? r.url : '(inline data)'}\n`);
  });
  if (res.referrals?.length) {
    console.log('  ↪ referrals (federated registries):');
    for (const ref of res.referrals) console.log(`      • ${ref.displayName} — ${ref.url}`);
    console.log();
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.query) {
    console.error('Usage: ard-search "<natural language query>" [--kind mcp|skill|cli|agent] [--federation referrals] [--limit N] [--json] [--url http://host/api]');
    process.exit(2);
  }
  render(await runSearch(args), args);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
