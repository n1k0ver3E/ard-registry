# ard-registry

An [**ard-spec**](https://github.com/ards-project/ard-spec) v0.9 conformant **Agentic Resource Discovery (ARD)** registry server, written in TypeScript.

ARD is the discovery layer for the agentic web — *"what is available for this task?"*. A registry crawls
`ai-catalog.json` manifests published by resource owners, indexes them, and answers natural-language
discovery queries with ranked results. Discovery happens **entirely before invocation**; the matched resource
is then called through its own native protocol (MCP / A2A / OpenAPI). See [the spec](https://agenticresourcediscovery.org/spec/).

```
client  ──POST /search { text, filter }──▶  registry  ──crawls──▶  ai-catalog.json (publisher .well-known)
        ◀──ranked results + referrals────              (BM25 over displayName/description/
                                                         capabilities/representativeQueries/tags)
```

## Endpoints

| Endpoint | Required | Purpose |
|---|---|---|
| `POST /api/search` | ✅ required | natural-language + filter → ranked results (`score` 0–100, `source`); federation-aware |
| `POST /api/explore` | optional | facet aggregation (counts by `type` / `publisher` / `tags`) |
| `GET /api/agents` | optional | deterministic, cacheable listing with `orderBy` + pagination |
| `GET /.well-known/ai-catalog.json` | self | advertises this registry as an `application/ai-registry+json` resource — it is itself discoverable & federatable |

`score` is **relevance only** — never a trust/safety rating (per spec). Filters compose **AND across keys, OR within values**.
`federation: referrals` returns pointers to upstream registries.

## Architecture

Concerns are split into small, single-responsibility modules; business logic is transport-agnostic and the
ranker sits behind an interface so an embedding ranker can replace BM25 without touching the services.

```
src/
  domain/      zod schemas = single source of truth (catalog + registry REST contract)
  ingest/      manifest-loader (file:// & http, flattens nested sub-catalogs) + catalog-validator
  index/       catalog-store (dedup by URN) · ranker (Ranker iface → Bm25Ranker) · build-store
  search/      search.service (local) · federation.service (referrals/auto-merge) · explore · agents · filter
  discovery/   self-catalog (this registry's own /.well-known manifest)
  http/        Fastify server — validates input, serializes output, nothing else
  config.ts · main.ts (createApp wires it all)
catalogs/      test-case data: real Cookiy resources as ARD manifests
bin/ard-search.ts   natural-language discovery CLI
```

## Test case: Cookiy (real data)

`catalogs/` catalogs genuine Cookiy resources, so the registry is exercised against real signal — all
**32 `cookiy_*` MCP tools** (grouped into 5 MCP server cards by domain), the **`user-research` Skill** plus its
two sub-skills, and the **Cookiy CLI** — 9 entries total.

```
$ pnpm search "I have interview transcripts and need to synthesize a report" --limit 3

   1. [██████████ 100] User Research (End to End) Skill          urn:air:cookiy.ai:skill:user-research
   2. [██████████  99] Synthesize Research Report (sub-skill)    urn:air:cookiy.ai:skill:synthesize-research-report
   3. [███░░░░░░░  33] Cookiy Report & Insights MCP              urn:air:cookiy.ai:mcp:report-and-insights

$ pnpm search "plan a study and write a screening questionnaire" --kind skill
$ pnpm search "recruit participants and run interviews" --federation referrals
```

## Verification (real, not smoke)

Verified against the **official ard-spec conformance CLI** (vendored under `vendor/`), plus unit + HTTP e2e tests:

```bash
pnpm verify           # typecheck + 25 tests + both conformance suites
pnpm verify:manifest  # conformance-test manifest catalogs/*.json   → 3/3 PASS
pnpm verify:registry  # boots the server, conformance-test registry → PASS, plus
                      # conformance-test manifest on the LIVE /.well-known URL → PASS
```

Current status: **typecheck clean · 25/25 tests · 3/3 manifests PASS · registry PASS · live self-manifest PASS (0 errors)**.
Tests include live federation across two real registries (real HTTP auto-merge).

> Note: the CLI catalog uses a non-standard media type (`application/x-cli+json`); the spec permits any IANA
> media type, so conformance flags it as one advisory **warning**, not an error.

## Quick start

```bash
pnpm install
pnpm start                      # registry on http://localhost:9010/api
pnpm search "run AI-moderated interviews and synthesize a report"
```

## Roadmap

- ✅ Live federation (`federation: auto`) that fetches & merges upstream registry results
- ✅ Serve our own `/.well-known/ai-catalog.json` so this registry is itself discoverable
- ⬜ Embedding-based `Ranker` (drop-in behind the existing interface) alongside BM25
- ⬜ Persistent index + periodic re-crawl of remote catalogs (currently crawl-on-boot)
