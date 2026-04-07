# ROADMAP-DETAILED.md — Storage Boundary + LLM UX Refactor

> Detailed execution plan for v0.1.3. Two checkpoints, one branch.

## Context

GPT-5 testing (two rounds) exposed:
1. DB stores canonical data (frontmatter JSON, block content) — violates first principle
2. LLM orientation requires 5-10 CLI calls — needs one-call surfaces
3. Cold start overhead on every command — read commands now skip indexAll (fixed)
4. No resolved record view — answering "what's happening with this case" requires 4+ chained calls

## Checkpoint 1: Storage Boundary Refactor

**Goal:** DB becomes derived-only. No canonical data in SQLite. All content reads go through files, guided by DB pointers.

### Step 1: Prove block pointers work

Before dropping anything, verify that warm reads can reconstruct block content from file using `start_line:end_line` pointers.

Write a test:
- Parse a fixture file
- Get block pointers from DB (block_id, start_line, end_line)
- Read the file, slice at those line ranges
- Compare against current `block.content` from DB
- Edge cases: preamble block (no heading), last block in file, single-line block, block after fenced code

If this passes, the content column is provably redundant.

### Step 2: Drop `frontmatter` from DocumentRecord

**types.ts:** Remove `frontmatter: Record<string, unknown>` from `DocumentRecord`

**backend/sqlite/schema.ts:** Drop `frontmatter TEXT NOT NULL` from documents table

**backend/sqlite/index.ts:**
- `putDocument()`: remove frontmatter from INSERT
- `rowToDocument()`: remove JSON.parse of frontmatter
- `findDocuments()`: remove `includeFrontmatter` logic (callers read file instead)
- `RawDocRow`: remove `frontmatter` field

### Step 3: Drop `content` from ParsedBlock

**types.ts:** Remove `content: string` from `ParsedBlock`

**backend/sqlite/schema.ts:** Drop `content TEXT NOT NULL DEFAULT ''` from blocks table

**backend/sqlite/index.ts:**
- `putBlocks()`: remove content from INSERT
- `getBlocks()`: remove content from SELECT/mapping
- `RawBlockRow`: remove `content` field

### Step 4: Add readFrontmatter helper

**engine.ts:** Add `async readFrontmatter(doc: DocumentRecord): Promise<Record<string, unknown>>`
- Reads file at `doc.filePath`
- Parses frontmatter via gray-matter
- Returns the frontmatter object

### Step 5: Update engine reads

**getDocument (hot):** Call `readFrontmatter()` instead of `doc.frontmatter`

**getDocument (warm):** Read file, slice at `match.startLine:match.endLine` from blocks table. Skip heading line, return content.

**getDocument (cold):** Already reads file — no change needed.

**updateDocument:** Parse frontmatter from file instead of `doc.frontmatter`. Already reads the file — just add frontmatter parse.

**validate:** Call `readFrontmatter()` for each doc being validated.

**inspect:** Call `readFrontmatter()` for validation check.

### Step 6: Update tests

Files that reference `doc.frontmatter`:
- tests/backend/sqlite.test.ts — `makeDoc()` helper, frontmatter assertions
- tests/engine/pipeline.test.ts — hot read assertions check `frontmatter` in response
- tests/engine/crud.test.ts — create/update assertions
- tests/writer/integration.test.ts — generated file assertions
- tests/writer/roundtrip.test.ts — field order assertions

Files that reference `block.content`:
- tests/backend/sqlite.test.ts — block storage test
- tests/engine/pipeline.test.ts — warm read `block.content` assertion
- tests/parser/blocks.test.ts — `content` field in ParsedBlock

**Note:** The parser itself (`parser/blocks.ts`) still produces content during parsing — it's needed for extraction. The change is that the DB no longer stores it. The `ParsedBlock` type used during parsing may need to stay separate from the type stored in the DB. Consider a `StoredBlock` type for DB records vs `ParsedBlock` for in-memory parsing.

### Green checkpoint

All 192+ tests pass. `npm run lint` clean. CLI commands work against maadb-testing. DB contains only pointers + extracted objects.

---

## Checkpoint 2: LLM UX Layer

**Goal:** One-call orientation, one-call resolved records, schema on demand.

### Step 7: `summary` command

Engine method: `summary(): SummaryResult`

Returns:
```json
{
  "types": [
    { "type": "client", "count": 2, "prefix": "cli", "sampleIds": ["cli-acme", "cli-meridian"] }
  ],
  "objects": {
    "entity": { "total": 50, "subtypes": { "person": 20, "attorney": 5, "org": 4 }, "samples": ["Jane Smith", "Sarah Chen"] },
    "date": { "total": 29, "samples": ["2026-04-01", "2025-09-15"] },
    "amount": { "total": 6, "samples": ["2200000 USD", "350000 USD"] }
  },
  "recentActivity": [
    { "docId": "note-2026-04-06-001", "action": "indexed", "timestamp": "..." }
  ],
  "stats": { "totalDocuments": 8, "totalObjects": 91, "totalRelationships": 11 }
}
```

Bounded: type samples capped at 3, object samples at 5, recent activity at 5.

CLI: `maad summary`

### Step 8: `get <id> full`

Engine method: extended `getDocument()` with depth `'full'`

Returns everything a hot read does, plus:
- Ref fields resolved to target names (e.g. `client: "cli-acme"` -> `client: { id: "cli-acme", name: "Acme Corporation" }`)
- Latest related note (if any case_note or note type links to this doc)
- Key extracted objects from this document (entities, dates, amounts)
- Related record summary (outgoing + incoming, with type and count)

This is the "tell me everything about this record" view.

### Step 9: `schema <type>` command

Engine method: already exists as `getSchema()`

CLI: `maad schema <type>` — returns full field definitions

### Step 10: Static MAAD.md

Remove volatile data (doc counts, type list) from Quick Start section.
MAAD.md is only regenerated if missing (already partially implemented).
Quick Start should say "run `summary` to see what's in this project" instead of hardcoding counts.

### Green checkpoint

All tests pass. `summary`, `get full`, and `schema` work against maadb-testing. MAAD.md is stable. LLM can orient in 2 steps: read MAAD.md, call summary.

---

## Success criteria

- DB size drops (no more frontmatter JSON or block content)
- `get hot` still works (reads file, returns frontmatter)
- `get warm <block>` still works (reads file, slices at line pointers)
- `summary` returns full project snapshot in one call
- `get <id> full` returns resolved record context in one call
- LLM orientation drops from 5-10 calls to 2 steps (read MAAD.md + call summary)
