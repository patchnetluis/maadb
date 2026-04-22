# MAADb — Markdown As A Database

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A522-brightgreen.svg)](package.json)
[![TypeScript](https://img.shields.io/badge/typescript-strict-blue.svg)](tsconfig.json)
[![Tests](https://img.shields.io/badge/tests-640%20passing-brightgreen.svg)](tests)
[![Version](https://img.shields.io/badge/version-0.7.0-purple.svg)](Version.md)

> **Markdown is the database. The engine makes it queryable.**

MAADb stores records as markdown files with YAML frontmatter for structured fields and body content for narrative. The engine validates schemas, builds a lookup index, and serves the whole thing to LLM agents over MCP. Your data stays in files you can read, grep, and version-control — not behind an opaque database server.

## Why MAADb

- **Markdown is canonical.** Open any record in any text editor — your data is exactly what's on screen, no translation layer.
- **Git is the audit trail.** Every write is a commit. `maad_history` shows the full change history for any record.
- **LLM-native.** Ships with 30+ MCP tools for discovery, read, write, maintenance, and auth. Designed for agent workflows from the start.
- **Optional schemas.** Add YAML schemas when you want structure, skip them when you don't. Validation runs on writes, never on old records.
- **The index is a speed layer.** SQLite stores pointers into your markdown files. Delete it and it rebuilds — your data never depends on the index surviving.
- **Safe under concurrent writes.** Clean shutdown, lock recovery, rate limiting, retry-safe operations all built in.

## Where MAADb fits

MAADb works as a context engine for AI agents — a place to hold the information they need to keep working, when that context still needs structure. Records are typed, relationships are queryable through MCP, and the data stays as readable markdown on disk. Common shapes: agent memory, project state, ongoing case files. For high-throughput transactional data or pure semantic retrieval at scale, purpose-built tools serve better.

## Quick example

A record lives as markdown with a schema-validated YAML header:

```markdown
---
doc_id: cas-2026-001
doc_type: case
schema: case.v1
title: Contract Review Dispute
client: cli-acme
status: open
opened_at: 2026-04-01
---

# Contract Review Dispute {#summary}

Dispute over delivery obligations and late change requests.

## Timeline {#timeline}

Initial issue raised on [[date:2026-03-28|March 28, 2026]].

## Parties {#parties}

[[person:Jane Smith|Jane]] representing [[org:Acme Corporation|Acme]].
```

Three addressable layers:

- **Frontmatter** — structured fields, schema-validated on write.
- **Headings** — individually-readable sections via line pointers.
- **Inline annotations** — `[[type:value|label]]` entities extracted and indexed cross-document.

## How it works

```
Markdown files (your data)
  -> YAML registry + schemas (define structure)
  -> Engine (parse, validate, extract, index)
  -> SQLite (pointer-only query index)
  -> MCP server (LLM agent interface)
```

See [FRAMEWORK.md](FRAMEWORK.md) for data doctrine, tier model, and engine design principles.

## Quick start

```bash
git clone https://github.com/maadb/maadb.git
cd maadb
npm install && npm run build
```

Create a project directory anywhere, then wire up MCP in your agent.

**Claude Code** (`.mcp.json` in the project directory):

```json
{
  "mcpServers": {
    "maad": {
      "command": "node",
      "args": [
        "/absolute/path/to/maadb/dist/cli.js",
        "--project", "/absolute/path/to/my-project",
        "serve",
        "--role", "admin"
      ]
    }
  }
}
```

Same shape for Claude Desktop (`claude_desktop_config.json`) and OpenClaw. Any MCP-compatible agent works — stdio is the default, HTTP/SSE is available since 0.5.0.

Restart your agent. The agent detects an empty project and enters **Architect mode** to design the schema based on your goal:

> *"Set up a CRM for my law firm."*
> *"Index my research papers for querying."*
> *"Create a persistent memory store for this agent."*

The Architect skill handles type discovery, schema design, registry creation, and deployment. From there, any agent with an MCP connection can read and write records.

## Remote / hosted deployment

MAADb serves over HTTP/SSE for multi-session hosted deployments. One process handles many concurrent client sessions with per-agent token auth at the handshake, concurrent reads, polling delta ([`maad_changes_since`](docs/change-feed.md)), live push notifications, and an unauthenticated `/healthz` liveness probe. TLS terminated upstream at a reverse proxy.

Generate a token from the CLI (plaintext printed ONCE; server stores only the SHA-256 hash):

```bash
node dist/cli.js --instance /path/to/instance.yaml auth issue-token \
  --role=admin --name='primary-gateway' --projects='*' --agent=agt-gateway
# → maad_pat_<32hex> on stdout
```

Clients present that plaintext as `Authorization: Bearer <token>` on every HTTP request. Start the server:

```bash
node dist/cli.js --instance /path/to/instance.yaml serve \
  --transport http --http-host 127.0.0.1 --http-port 7733
```

Hot-reload tokens + instance config on edits: `sudo systemctl reload maad` (or `docker compose kill -s SIGHUP maad`). Rotate tokens via `maad auth rotate-token --id=tok-<id>`; revoke via `maad auth revoke-token --id=tok-<id>`. Full auth primitives: [`docs/specs/0.7.0-scoped-auth.md`](docs/specs/0.7.0-scoped-auth.md).

Deployment guides:

- [systemd + nginx (bare metal)](docs/deploy/systemd.md)
- [Docker + traefik](docs/deploy/docker.md)
- [Change feed — polling patterns + cadence](docs/change-feed.md)

## Access roles

MCP roles control what tools an agent can use. Set via `--role` at server startup, or in `instance.yaml` per project.

| Role | Tools | Use case |
|------|-------|----------|
| `reader` (default) | scan, summary, describe, get, query, search, related, schema, aggregate, join, verify, changes_since, history, audit | Read-only agents, reporting, analysis |
| `writer` | reader + create, update, validate, bulk_create, bulk_update | Standard agents that read and write records |
| `admin` | writer + delete, reindex, reload, health | Project setup, schema changes, maintenance |

Under stdio (local subprocess), the agent has filesystem access anyway, so role enforcement is advisory — the trust boundary is the host machine. Under HTTP transport (0.7.0+), the bearer token hashes into the per-agent registry at `_auth/tokens.yaml`; the token's global role × per-project cap × instance project ceiling compose via a three-cap min rule on every tool call. Token records are immutable except `revokedAt` — capability changes require `maad auth revoke-token` + `issue-token`.

## Project layout

```
my-project/
  _registry/                      # Type definitions (YAML)
    object_types.yaml
  _schema/                        # Field schemas per type (YAML)
    client.v1.yaml
  _backend/                       # Derived index — gitignored, rebuildable
    maad.db
  _inbox/                         # Raw files for import — drop zone
  _skills/                        # Agent skill files (architect, import, etc.)
  data/                           # All records live here
    clients/                      #   One folder per registered type
      cli-acme.md
    cases/
      cas-2026-001.md
  MAAD.md                         # Generated: agent operating instructions
```

**Convention:** `_` prefix = engine-managed. `data/` = your records. Records never live at the project root.

## MCP tools

All tools return `{ ok: true, data: {...} }` or `{ ok: false, errors: [...] }`. Call `maad_schema <type>` for full field definitions before writing.

**Discover:** `maad_scan`, `maad_summary`, `maad_describe`, `maad_schema`
**Read:** `maad_get`, `maad_query`, `maad_search`, `maad_related`, `maad_aggregate`, `maad_join`, `maad_verify`, `maad_changes_since`
**Write:** `maad_create`, `maad_update`, `maad_bulk_create`, `maad_bulk_update`, `maad_validate`
**Maintain:** `maad_delete`, `maad_reindex`, `maad_reload`, `maad_health`, `maad_history`, `maad_audit`
**Live updates (0.6.11+):** `maad_subscribe`, `maad_unsubscribe` — push notifications on durable writes.
**Instance admin:** `maad_instance_reload`, `maad_subscriptions`.
**Auth admin (0.7.0+):** `maad_issue_token`, `maad_revoke_token`, `maad_rotate_token`, `maad_list_tokens`, `maad_show_token`.

In multi-project mode, session tools are always available pre-bind: `maad_projects`, `maad_use_project`, `maad_use_projects`, `maad_current_session`.

## Agent boot flow

1. Agent reads `MAAD.md` → stable operating instructions
2. Agent runs `maad_summary` → live project snapshot
3. If empty project → reads `_skills/architect-core.md`, enters Architect mode
4. If live project → uses MCP tools for normal operations

## Current state

**Current:** v0.7.0 — Scoped auth & identity (per-agent tokens, three-cap role composition, identity-enriched audit + commits) plus a response-hygiene pass. 640 tests passing.

See [Version.md](Version.md) for the full release history and [ROADMAP.md](ROADMAP.md) for the path to 1.0.

## Stack

- TypeScript strict, Node.js 22+ (tested on v24)
- 6 production dependencies: `better-sqlite3`, `gray-matter`, `js-yaml`, `simple-git`, `@modelcontextprotocol/sdk`, `pino`
- 640 tests, Vitest
- MIT license, pre-1.0, actively developed

## License

MIT — see [LICENSE](LICENSE).
