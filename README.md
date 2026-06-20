# ard-registry

An [**ard-spec**](https://github.com/ards-project/ard-spec) v0.9 conformant **Agentic Resource Discovery (ARD)** registry server, written in TypeScript.

ARD is the discovery layer for the agentic web — *"what is available for this task?"*. A registry crawls
`ai-catalog.json` manifests published by resource owners, indexes them, and answers natural-language
discovery queries. Discovery happens **entirely before invocation**; the resource is then called through its
own native protocol (MCP / A2A / OpenAPI). See [the spec](https://agenticresourcediscovery.org/spec/).

This server implements the three registry endpoints:

| Endpoint | Required | Purpose |
|---|---|---|
| `POST /api/search` | ✅ required | natural-language + filter → ranked results |
| `POST /api/explore` | optional | facet aggregation (counts by `type` / `publisher` / `tags`) |
| `GET /api/agents` | optional | deterministic, cacheable listing |

## Test case: Cookiy

The `catalogs/` directory catalogs **real Cookiy resources** as ARD entries — its 32 `cookiy_*` MCP tools
(grouped into MCP server cards by domain), the `user-research` Skill (+ sub-skills), and the Cookiy CLI — so
the registry can be exercised end to end against genuine data.

## Verification

This project is verified against the **official ard-spec conformance CLI** (vendored under `vendor/`), not just
smoke checks:

```bash
pnpm verify:manifest    # conformance-test manifest catalogs/*.json  → PASS
pnpm verify:registry    # boots the server, conformance-test registry → PASS (exit 0)
pnpm verify             # typecheck + unit/e2e tests + both conformance suites
```

## Quick start

```bash
pnpm install
pnpm start                      # registry on http://localhost:9010/api
pnpm search "run AI-moderated interviews and synthesize a report"
```

## Status

Work in progress — built milestone by milestone. See `CHANGELOG`-style commit history.
