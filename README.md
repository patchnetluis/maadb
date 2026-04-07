# MAAD — Markdown As A Database

A lightweight engine that treats markdown files as the canonical data store, builds a queryable index, and gives LLMs deterministic read/write access.

Markdown is the source of truth. YAML is the interface language. SQLite is a rebuildable index — delete it and reconstruct from markdown in one pass. Nothing is lost.

## Why

Traditional databases capture fragments — enough to run a query or generate a report, but not enough to explain *why* something happened. Markdown carries the full narrative: who, what, when, where, how, and why. MAAD indexes it so LLMs can query structure first and open full context second.

## How it works

```
Markdown files (canonical records)
  -> YAML registry + schemas (structure definitions)
  -> 6-stage pipeline (parse, validate, extract, materialize)
  -> SQLite index (pointer-only — no data stored, just pointers)
  -> CLI (17 commands) + MCP server (15 tools)
```

### Record format

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

Frontmatter = structured fields. Headings = addressable sections. `[[type:value|label]]` = inline annotations extracted and indexed by the engine. 11 extraction primitives: `entity`, `date`, `duration`, `amount`, `measure`, `quantity`, `percentage`, `location`, `identifier`, `contact`, `media`.

## Quick start

```bash
npm install && npm run build

# Initialize a project
maad init my-project

# Add types, schemas, and markdown records, then:
maad --project my-project reindex --force

# Orient yourself
maad --project my-project summary
```

### LLM-native onboarding

Drop raw markdown files and let the LLM bootstrap the project:

```bash
maad scan ./raw-files/        # corpus-level patterns — LLM sees what types want to exist
# LLM creates registry + schemas + adds frontmatter
maad --project ./raw-files reindex --force
```

## Commands

### Discover
| Command | What it does |
|---------|-------------|
| `scan <file\|dir>` | Analyze raw markdown — no registry needed |
| `summary` | **Start here.** Types, counts, sample IDs, object inventory |
| `describe` | Project overview: types, doc counts, primitives |

### Read
| Command | What it does |
|---------|-------------|
| `get <id> hot` | Frontmatter only (cheapest read) |
| `get <id> warm <block>` | Frontmatter + one section |
| `get <id> cold` | Full document body (expensive) |
| `get <id> full` | Resolved record: refs, objects, related docs |
| `query <type> [--filter k=v]` | Find documents by type and filters |
| `search <primitive> [--doc id]` | Cross-document object search |
| `related <id> [direction]` | Connected documents |
| `schema <type>` | Field definitions for a type |

### Write
| Command | What it does |
|---------|-------------|
| `create <type> --field k=v` | Create a new record |
| `update <id> --field k=v` | Update frontmatter fields |
| `update <id> --append "text"` | Append to document body |

### Maintain
| Command | What it does |
|---------|-------------|
| `validate [id]` | Validate against schemas |
| `reindex [--force]` | Rebuild index from markdown |
| `history <id>` | Git history for a document |
| `audit [--since date]` | Project-wide activity |

## MCP Server

Native LLM tool access via Model Context Protocol. 15 tools, role-based access, stdio transport.

```bash
maad serve --project ./my-project                 # reader (default)
maad serve --project ./my-project --role writer    # read + write
maad serve --project ./my-project --role admin     # full access
```

| Role | Tools | Count |
|------|-------|-------|
| reader | scan, summary, describe, get, query, search, related, schema, history, audit | 10 |
| writer | reader + create, update, validate | 13 |
| admin | writer + delete, reindex | 15 |

All tools return `{ ok: true, data: {...} }` or `{ ok: false, errors: [...] }`.

## LLM boot flow

1. Read `MAAD.md` — stable operating instructions
2. Run `summary` — live project snapshot
3. Use commands as needed

## Project layout

```
my-project/
  _registry/object_types.yaml    # Type definitions
  _schema/*.yaml                 # Field schemas per type
  <type_folder>/*.md             # Markdown records
  _backend/maad.db               # Gitignored — rebuildable index
  MAAD.md                        # Auto-generated LLM instructions
  SCHEMA.md                      # Auto-generated data reference
```

## Stack

- TypeScript strict, Node.js 18+
- 4 production dependencies: `better-sqlite3`, `gray-matter`, `simple-git`, `@modelcontextprotocol/sdk`
- 211 tests, Vitest
- See [FRAMEWORK.md](FRAMEWORK.md) for data doctrine, tier model, and engine design principles

## Current state

**v0.2.0** — MCP server with 15 tools, role-based access (reader/writer/admin), stdio transport. Framework-aligned engine with 17 CLI commands, pointer-only DB, three-tier command model.

## Roadmap

| Version | What |
|---------|------|
| ~~0.2.0~~ | ~~MCP server~~ — **shipped** |
| 0.3.0 | Reverse import — CSV/JSON/SQL into markdown |
| 0.4.0 | Query enhancements — FTS5, compound filters |
| 1.0.0 | Stable release — API locked, npm published |

## License

MIT
