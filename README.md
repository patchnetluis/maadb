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
  -> CLI / future MCP tools (17 commands)
```

Each markdown file is a record. YAML frontmatter is the structured data. Headings are addressable sections. Inline `[[type:value|label]]` annotations capture entities, dates, amounts, and other values embedded in natural language. The engine extracts and indexes them.

## Quick start

```bash
# Install
npm install
npm run build

# Initialize a project
node dist/cli.js init my-project

# Add types, schemas, and markdown records, then:
node dist/cli.js --project my-project reindex --force

# Orient yourself (one call)
node dist/cli.js --project my-project summary

# Read a record
node dist/cli.js --project my-project get <doc_id> hot
```

## Commands

### Read
| Command | What it does |
|---------|-------------|
| `summary` | **Start here.** Types, counts, sample IDs, object inventory |
| `describe` | Project overview: types, doc counts, primitives |
| `get <id> hot` | Frontmatter only (cheapest read) |
| `get <id> warm <block>` | Frontmatter + one section |
| `get <id> cold` | Full document (expensive) |
| `get <id> full` | Resolved record: refs resolved, objects, related docs |
| `query <type>` | All documents of a type |
| `query <type> --filter k=v` | Filtered by indexed field |
| `search <primitive>` | Cross-document object search |
| `related <id> both` | Connected documents (outgoing + incoming) |
| `inspect <id>` | Full engine internals for a document |
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
| `reindex [--force]` | Rebuild the index from markdown |
| `history <id>` | Git history for a document |
| `audit [--since date]` | Project-wide activity |

## Architecture

### Project layout

```
my-project/
  _registry/
    object_types.yaml       # Type definitions
  _schema/
    client.v1.yaml          # Schema per type
    case.v1.yaml
  clients/
    cli-acme.md             # Markdown records
  cases/
    cas-2026-001.md
  _backend/                 # Gitignored — rebuildable index
    maad.db
  MAAD.md                   # Auto-generated LLM instructions
  SCHEMA.md                 # Auto-generated data reference
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
priority: high
---

# Contract Review Dispute {#summary}

Dispute over delivery obligations and late change requests.

## Timeline {#timeline}

Initial issue raised on [[date:2026-03-28|March 28, 2026]].

## Parties {#parties}

[[person:Jane Smith|Jane]] representing [[org:Acme Corporation|Acme]].
[[person:Bob Torres|Bob]] representing the vendor.
```

### Three-layer type system

| Layer | Owner | Purpose |
|-------|-------|---------|
| **Registry types** | User | Domain-specific doc_types (`client`, `case`, `contact`). MAAD ships none. |
| **Extraction primitives** | Engine | 11 fixed value types recognized in `[[...]]` annotations. |
| **Engine records** | Engine | Materialized index infrastructure. Rebuildable from markdown. |

### 11 extraction primitives

`entity`, `date`, `duration`, `amount`, `measure`, `quantity`, `percentage`, `location`, `identifier`, `contact`, `media`

Each has distinct normalization behavior. Subtype labels (e.g., `person`, `org`, `attorney`) map to their parent primitive but are preserved for filtering.

### Pointer-only database

SQLite stores pointers, not data:

| Table | Stores | Does NOT store |
|-------|--------|---------------|
| `documents` | doc_id, type, path, hash, version | ~~frontmatter~~ |
| `blocks` | heading, level, start_line, end_line | ~~content~~ |
| `objects` | primitive, subtype, value, normalized, location | |
| `relationships` | source, target, field, type | |
| `field_index` | field_name, field_value, numeric_value | |

All reads go to disk. Delete the DB, reindex, everything is back.

### Four read depths

| Depth | Returns | Cost |
|-------|---------|------|
| `hot` | Frontmatter from file | Minimal |
| `warm` | Frontmatter + one block via line pointers | Low |
| `cold` | Full document body | High |
| `full` | Frontmatter + resolved refs + objects + related docs | Medium |

### Git audit layer

Every write auto-commits with structured, parseable messages:

```
maad:create cli-acme [client] — Acme Corporation
maad:update cas-2026-001 [case] fields:status — status: open -> pending
maad:delete note-001 [case_note] soft — Soft deleted note-001
```

Four audit commands (`history`, `diff`, `snapshot`, `audit`) give full traceability without raw git access.

## LLM boot flow

1. Read `MAAD.md` — stable operating instructions (commands, syntax, rules)
2. Run `summary` — live project snapshot (types, counts, sample IDs, object inventory)
3. Use commands as needed

`SCHEMA.md` is a deep structural reference — read it when `schema <type>` isn't enough.

## Stack

- TypeScript strict, Node.js 18+
- 3 production dependencies: `better-sqlite3`, `gray-matter`, `simple-git`
- 203 tests, Vitest

## Current state

**v0.1.4** — Functional engine with 17 CLI commands, pointer-only DB, LLM UX layer (summary, get full, schema), static boot contract.

## Roadmap

| Version | What |
|---------|------|
| 0.2.0 | MCP server — ~15 LLM tools via stdio transport |
| 0.3.0 | Reverse import — CSV/JSON/SQL into markdown |
| 0.4.0 | Query enhancements — FTS5, compound filters |
| 1.0.0 | Stable release — API locked, npm published |

## License

MIT
