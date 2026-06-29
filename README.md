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
| `GET /api/sources` | mgmt | per-source crawl status (last crawl, ok, entry counts) |
| `GET /api/openapi.json` | docs | OpenAPI 3.1 spec, derived from the zod schemas (feed to Swagger/Postman/codegen) |
| `GET /` (and `/ui`) | console | self-hosted Web console — browse all resources, search, sources, one-click invoke |
| `GET /.well-known/ai-catalog.json` | self | advertises this registry as an `application/ai-registry+json` resource — it is itself discoverable & federatable |

`score` is **relevance only** — never a trust/safety rating (per spec). Filters compose **AND across keys, OR within values**.
`federation: referrals` returns pointers to upstream registries.

### Three consumption surfaces

Like Hugging Face's Discover Tool, the same discovery engine is exposed three ways — pick whichever fits the client:

| Surface | How | Use from |
|---|---|---|
| **REST** | `POST /api/search` · `/api/explore` | any HTTP client |
| **CLI** | `pnpm discover "<query>"` | terminal, CI |
| **MCP** | `pnpm mcp` (stdio server, tools `discover` + `explore`) | Claude Code/Desktop, Cursor, any MCP agent |

The MCP server is how an **LLM agent** actually uses this layer: it preloads exactly one `discover` tool and finds
everything else at runtime. Runs in-process over the local catalogs by default; set `ARD_REGISTRY_URL` to proxy a
running registry instead.

## Architecture

Concerns are split into small, single-responsibility modules; business logic is transport-agnostic and the
ranker sits behind an interface so an embedding ranker can replace BM25 without touching the services.

```
src/
  domain/      zod schemas = single source of truth (catalog + registry REST contract)
  ingest/      manifest-loader (file:// & http, flattens nested sub-catalogs) + catalog-validator
  index/       catalog-store (dedup by URN, atomic replaceAll) · ranker (Ranker iface → Bm25Ranker)
  crawl/       sources (resolve source set) · crawler (per-source last-good + schedule) · snapshot (persist)
  search/      search.service (local) · federation.service (referrals/auto-merge) · explore · agents · filter · kinds
  discovery/   self-catalog (this registry's own /.well-known manifest)
  mcp/         MCP discovery tools (discover/explore) over a local or remote backend
  services.ts  createServices = the one composition root reused by HTTP, CLI, MCP
  http/        Fastify server · openapi (zod→OpenAPI 3.1) · console.html (zero-dep Web UI)
  config.ts · main.ts (createApp wires it all)
catalogs/      test-case data: real Cookiy resources as ARD manifests
bin/ard-search.ts · bin/ard-mcp.ts   CLI + MCP entrypoints
```

## Crawl sources, scheduling & persistence

The registry indexes a **configured set of sources** (not the open web) — like Artifactory proxies configured
upstream repos rather than scraping all of npm. Resolution precedence:

1. `ARD_SOURCES` — inline JSON array of sources, else
2. `ARD_SOURCES_FILE` — a JSON file (see [`sources.json`](sources.json)), else
3. the local `catalogs/` dir (offline default).

Each source is an `ai-catalog.json` (file path or URL). The crawler keeps each source's **last-good** entry set
(a briefly-unreachable source doesn't drop out), atomically swaps the union into the store, and persists a
snapshot (`ARD_SNAPSHOT`) so a restart serves last-known data instantly. A scheduler re-crawls every
`ARD_CRAWL_INTERVAL_MS` (default 15 min); `GET /api/sources` shows per-source status.

**Tolerant ingestion (Postel's law):** our own catalogs are validated strictly (conformance gate), but crawled
third-party manifests are ingested leniently — e.g. Hugging Face's real manifest uses `urn:ai:` instead of the
spec's `urn:air:`, so non-conforming ids/types become warnings, unusable entries are skipped, and the rest are
still indexed.

```bash
pnpm verify:crawl   # live: crawls local catalogs + HF's PUBLIC manifest, proves HF resources are discoverable
```

## Test case: Cookiy + Hermes Tweet (real data)

`catalogs/` catalogs genuine Cookiy and Hermes Tweet resources, so the registry is exercised against real signal - all
**32 `cookiy_*` MCP tools** (grouped into 5 MCP server cards by domain), the **`user-research` Skill** plus its
two sub-skills, the **Cookiy CLI**, and the **Hermes Tweet skill** - 10 entries total.

```
$ pnpm discover "I have interview transcripts and need to synthesize a report" --limit 3

   1. [██████████ 100] User Research (End to End) Skill          urn:air:cookiy.ai:skill:user-research
   2. [██████████  99] Synthesize Research Report (sub-skill)    urn:air:cookiy.ai:skill:synthesize-research-report
   3. [███░░░░░░░  33] Cookiy Report & Insights MCP              urn:air:cookiy.ai:mcp:report-and-insights

$ pnpm discover "plan a study and write a screening questionnaire" --kind skill
$ pnpm discover "recruit participants and run interviews" --federation referrals
```

> Use `pnpm discover` — **not** `pnpm search`. `search` is a built-in pnpm command that
> queries the npm registry and would just print `No matches found`. `pnpm run discover` also works.

## Verification (real, not smoke)

Verified against the **official ard-spec conformance CLI** (vendored under `vendor/`), plus unit + HTTP e2e tests:

```bash
pnpm verify           # typecheck + 38 tests + both conformance suites
pnpm verify:manifest  # conformance-test manifest catalogs/*.json   → 4/4 PASS
pnpm verify:registry  # boots the server, conformance-test registry → PASS, plus
                      # conformance-test manifest on the LIVE /.well-known URL → PASS
```

Current status: **typecheck clean · 38/38 tests · 4/4 manifests PASS · registry PASS · live self-manifest PASS (0 errors)**.
Tests include live federation across two real registries (real HTTP auto-merge) and a real MCP-protocol
round-trip (SDK client ↔ our server).

> Note: the CLI catalog uses a non-standard media type (`application/x-cli+json`); the spec permits any IANA
> media type, so conformance flags it as one advisory **warning**, not an error.

## Quick start

```bash
pnpm install
pnpm start                         # REST registry + Web console on http://localhost:9010
pnpm discover "run AI-moderated interviews and synthesize a report"   # CLI search
pnpm mcp                           # MCP server over stdio (discover/explore tools)
# then open http://localhost:9010 for the console (browse · search · sources · API · one-click invoke)
```

Add it to an MCP client (e.g. Claude Code) so an agent can discover at runtime:

```bash
claude mcp add ard-registry -- pnpm --dir /path/to/ard-registry mcp
```

## Roadmap

- ✅ Live federation (`federation: auto`) that fetches & merges upstream registry results
- ✅ Serve our own `/.well-known/ai-catalog.json` so this registry is itself discoverable
- ⬜ Embedding-based `Ranker` (drop-in behind the existing interface) alongside BM25
- ✅ Configurable crawl sources + scheduled re-crawl + snapshot persistence + tolerant ingestion
- ⬜ `verify` — actually validate trustManifest/attestations (the "other half" of discovery)
- ⬜ Embedding/hybrid ranker; richer management (catalog CRUD, RBAC, audit)
