#!/usr/bin/env tsx
import { createServices } from '../src/services.js';
import { kindFilter } from '../src/search/kinds.js';
import { SearchRequestSchema, type SearchResponse } from '../src/domain/registry.schema.js';

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
  const filter = kindFilter(args.kind);
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

  const { federationService } = await createServices();
  return federationService.search(req);
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
