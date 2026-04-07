# MAAD — Markdown Augmented Adaptive Database

> The idea is MAAD. So is the name.

A format that matches how humans actually think about information, with just enough structure for machines to act on it.

**Not a database pretending to be markdown. Not markdown pretending to be a database. Something in between that shouldn't work — but does.**

---

## The Problem

Most business data was never truly relational. Contacts, cases, notes, logs, correspondence — narrative data with metadata — shoved into relational structures because that was all we had. Trillions of records sitting in Oracle, AS/400, Access, and Postgres wearing a straitjacket they never needed.

Simultaneously, the agent and LLM world is arriving. Agents need data that is readable, traversable, and contextual. SQL was not designed for this. Vector search approximates meaning but loses structure. RAG chunks arbitrarily and discards relationships.

MAAD is a different primitive.

---

## What It Is

Markdown files are the source of truth. YAML frontmatter adds structured metadata. A thin adapter layer provides "good enough" database behaviours — not ACID, but functional — without changing the files themselves.

```
Markdown (human layer)
  + YAML frontmatter (structured metadata)
  + Directives (executable YAML keys, prefixed _)
  + Transclusion tokens (<<file>> references)
  → Adapter (tool calls, concurrency, resolution)
  → Backend DB (indexes, snapshots, lock state — cache only)
  → Queryable, agent-readable output
```

The backend is a projection, not the source of truth. Delete it and rebuild from markdown in one pass. Nothing is lost.

---

## What It Is Not

- Not ACID
- Not a replacement for high-frequency transactional systems
- Not for millions of writes per second
- Not a document store with a markdown skin

---

## Core Concepts

### 1. The File

Every record is a markdown file. YAML frontmatter holds structured fields. The body holds narrative content.

```markdown
---
type: case
client: <<clients/AcmeCorp.md>>
billing_rate: <<clients/AcmeCorp.md::billing_rate>>
status: open
date_opened: 2024-01-10
_calc: sum(time_entries[].hours) * billing_rate
_rollup: cases[client=AcmeCorp, status=open]
_lock: { holder: null, version: 14, ttl: null }
_index:
  forward: ["cases/case-002.md", "notes/2024-03-22.md"]
  backward: ["cases/case-000.md"]
  anchors:
    - { label: settlement_discussion, line: 42 }
    - { label: time_entry_block, line: 87 }
---

# Case 001 — Contract Review

Notes live here, naturally, in plain English.

## Settlement discussion
...
```

### 2. Directives

Directives are YAML keys prefixed with `_`. They are instructions to the adapter, not data. They are never resolved inside the `.md` file — results live in the backend only.

| Directive | Purpose |
|-----------|---------|
| `_ptr` | Pointer to another file, field, or anchor |
| `_calc` | Inline calculation over resolved field values |
| `_rollup` | Cross-file aggregation via backend index |
| `_lock` | Soft concurrency lock (session, timestamp, TTL) |
| `_ver` | Version counter for conflict detection |
| `_index` | Forward/backward navigation + anchor map |
| `_backend` | Explicit backend snapshot and index refs |
| `_conflict` | Written by adapter on conflict detection |

### 3. Transclusion

The `<<file>>` syntax embeds another file's content or fields inline. Files become live variables. Change the source once — every file that transcluded it gets the updated value on next read.

```yaml
# Full file (cold read)
client: <<clients/AcmeCorp.md>>

# Single field from frontmatter (hot — YAML only)
billing_rate: <<clients/AcmeCorp.md::billing_rate>>

# Named anchor block (warm — one chunk)
contact: <<clients/AcmeCorp.md#contact_section>>

# Field with fallback default
rate: <<clients/AcmeCorp.md::billing_rate | 0.00>>

# Inline rollup via transclusion
open_cases: <<cases[client=AcmeCorp, status=open]::count>>
```

### 4. The Directive Grammar

**`_ptr` — pointer resolution**
```yaml
_ptr: contacts/john-doe.md
_ptr: { file: cases/case-001.md, anchor: settlement_discussion }
_ptr: { file: clients/AcmeCorp.md, field: billing_rate }
```
Resolved at read time from backend pointer cache. Can point to a file, anchor, or single field value.

**`_calc` — inline calculation**
```yaml
_calc: sum(time_entries[].hours)
_calc: sum(time_entries[].hours) * billing_rate
_calc: count(time_entries[status=billed])
```
Supported functions: `sum`, `count`, `avg`, `min`, `max`. Anything more complex is a dedicated tool call, not a directive. Results stored in backend snapshot, never written to `.md`.

**`_rollup` — cross-file aggregation**
```yaml
_rollup: cases[client=AcmeCorp, status=open]
_rollup: { from: cases[client=AcmeCorp], field: total_hours, fn: sum }
_rollup: notes[date>=2024-01-01, tag=billable]
```
Queries backend index only. Never reads raw markdown. Returns refs or aggregated value. Cached with TTL, invalidated on write to any file in scope.

**`_lock` / `_ver` — concurrency**
```yaml
_ver: 14
_lock: { holder: session-abc, ts: 1712345678, ttl: 30s }
_conflict: { detected: true, winning_ver: 15, diff_ref: db://conflicts/case-001-v14 }
```
Last-write-wins with conflict flagging. TTL auto-expires locks. Conflicts are logged, not silently overwritten. `_lock` is backend-only — never written to the `.md` file.

---

## Three-Tier Memory Model

MAAD gives agents structured access without requiring full file consumption.

| Tier | What | Token cost | How |
|------|------|------------|-----|
| Hot | YAML frontmatter + indexes | Minimal | Read frontmatter only |
| Warm | Targeted chunk via anchor | Low | `#anchor` or `::field` |
| Cold | Full file | High | Bare `<<file>>` or full read |

The agent specifies the tier. The adapter enforces it. Most queries never leave Hot or Warm.

---

## Schema Enforcement

Schemas live in a `_schema/` directory. Each file type has a schema file.

```yaml
# _schema/case.yaml
type: case
required:
  - client
  - status
  - date_opened
fields:
  client:
    type: _ptr
    target: clients/
  status:
    type: enum
    values: [open, closed, pending]
  billing_rate:
    type: number
    default: 0
```

Validation fires on every write, after transclusions are resolved but before the file is touched. A failed validation rejects the write — the `.md` file is never written to in a dirty state.

---

## File Structure

```
/
├── _schema/
│   ├── client.yaml
│   ├── contact.yaml
│   ├── case.yaml
│   └── note.yaml
├── clients/
│   ├── AcmeCorp.md
│   └── BetaInc.md
├── contacts/
│   └── john-doe.md
├── cases/
│   ├── case-001.md
│   └── case-002.md
├── notes/
│   └── 2024-01-15-acme.md
└── _backend/             ← gitignore this, it's a cache
    ├── indexes/
    ├── snapshots/
    ├── locks/
    └── conflicts/
```

---

## Adapter Tool Spec

The adapter exposes three core tools to the agent. The agent never touches the filesystem directly.

### `maad.query`

Hits the backend index only. Returns file references. Never reads markdown.

```typescript
maad.query({
  type: "case",
  client: "AcmeCorp",
  dates: { from: "2024-01", to: "2024-03" },
  status: "open"
})
// → ["cases/case-001.md", "cases/case-003.md"]
```

### `maad.read`

Tiered read. Agent specifies how deep.

```typescript
maad.read({
  file: "cases/case-001.md",
  tier: "warm",              // hot | warm | cold
  anchor: "settlement_discussion"
})
// → { frontmatter: {...}, body_chunk: "## Settlement discussion\n..." }
```

### `maad.write`

Checks version, validates schema, writes file, updates backend.

```typescript
maad.write({
  file: "cases/case-001.md",
  version: 14,               // must match current _ver or write is rejected
  frontmatter: { status: "closed" },
  body: "..."
})
// → { status: "ok", version: 15, snapshots: { total_billed: 1462.50 } }
```

---

## Resolver Order

### READ pipeline

1. **Lock check** — if write-locked and not a hot read, queue or reject
2. **Parse frontmatter** — YAML only, no body read (hot stop available)
3. **Resolve `_ptr`** — backend pointer cache, depth-first, max depth 3
4. **Resolve `<<transclusions>>`** — hot first, then warm, then cold, batched per tier
5. **Schema validation** — hydrated frontmatter validated against schema
6. **Execute `_calc`** — over resolved field values, result to backend snapshot
7. **Execute `_rollup`** — backend index query, cached with TTL
8. **Apply anchor map** — slice body at stored line number if anchor requested
9. **Return resolved document** — hydrated frontmatter + requested body chunk

### WRITE pipeline

1. **Version check** — incoming `_ver` vs stored; mismatch = conflict, write rejected
2. **Acquire lock** — session ID + TTL written to backend only
3. **Parse + resolve incoming frontmatter** — same as READ steps 2–4
4. **Schema validation** — reject before touching the file
5. **Write markdown file** — directives and transclusion tokens written as-is, never resolved
6. **Recalculate `_calc` + `_rollup`** — new snapshots, invalidate affected rollup caches
7. **Bump version + release lock** — backend version incremented, lock cleared, date index updated
8. **Return confirmation** — new version, recalculated snapshots, invalidated rollup keys

**Key rule: guards first, writes last. The `.md` file is never touched in a dirty state.**

---

## Why Now

**LLMs read markdown natively.** No ORM, no schema translation, no prompt-engineering around SQL results.

**Agents navigate, not query.** The `_index` forward/backward links and anchor maps let agents traverse data the way they think — relationally and contextually — not via SQL joins.

**Legacy liberation.** Extract from Oracle, Access, AS/400. Convert to MDDB. Suddenly the data is portable, human-readable, git-trackable, and AI-traversable. The migration path is a flat file export and a converter script.

**Zero vendor lock-in.** The source of truth is plain text files. The backend is a cache. Walk away from any tooling at any time.

**Git-native by default.** Every change is diffable, reversible, and auditable. Collaboration and history come for free.

---

## Design Principles

1. **Markdown is the source of truth.** The backend is always reconstructable from the files.
2. **Directives belong to the adapter.** `_`-prefixed keys are never resolved in the file itself.
3. **The file stays clean.** Computed values, resolved transclusions, and lock state never pollute the `.md`.
4. **Good enough concurrency.** Last-write-wins + conflict flagging covers most use cases. This is not a banking system.
5. **Tier-aware reads.** Agents specify how much they need. The adapter enforces the minimum.
6. **Schema is a gate, not a straitjacket.** Required fields are enforced. Everything else is flexible.
7. **The directive grammar stays minimal.** `sum`, `count`, `avg`, `min`, `max`. Anything more complex is a tool call.

---

## Status

Early concept. The name is MAAD. The idea is MAAD. Contributions, critique, and war stories about data trapped in legacy databases all welcome.

> MAAD is distinct from [MarkdownDB](https://markdowndb.com) (`mddb`), which indexes markdown into SQL. MAAD keeps markdown as the source of truth and wraps it with an adaptive layer — directives, transclusion, agent memory tiers, soft concurrency. Different problem, different design.

---

## Roadmap

- [ ] Adapter reference implementation (TypeScript)
- [ ] CLI: `mddb query`, `mddb read`, `mddb validate`
- [ ] Legacy DB export converter (PostgreSQL, SQLite, Access)
- [ ] Obsidian plugin (read-only query layer via Dataview bridge)
- [ ] Agent SDK (tool definitions for OpenAI, Anthropic, LangChain)
- [ ] Schema authoring tool
- [ ] Conflict resolution UI

---

*MAAD is a format proposal, not a product. The goal is a shared primitive that the agent and open-source communities can build on.*
