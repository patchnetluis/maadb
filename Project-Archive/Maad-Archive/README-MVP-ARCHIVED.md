# MAAD MVP Build Spec

> Markdown Augmented Adaptive Database

A domain-agnostic TypeScript engine that treats markdown as the canonical database, builds a queryable index over it, and gives LLMs deterministic read/write access.

Markdown is the source of truth. YAML is the interface language. The backend is rebuildable infrastructure — delete it and reconstruct from markdown in one pass. Nothing is lost. MAAD reads markdown records, extracts key objects, attaches pointers back to exact source locations, and materializes a fast index so the LLM can query structure first and open full context second. The architecture is bidirectional: markdown can be indexed forward into objects, and existing databases can be mapped into MAAD objects and output as markdown records.

---

## Summary Spec

### What it does

- **Reads** markdown files, parses YAML frontmatter + body, extracts structured objects, and materializes them into a queryable index
- **Writes** markdown files deterministically through schema-enforced templates so LLM output is consistent and machine-parseable
- **Two modes:** Exploratory (speed-read via index) and Deterministic (controlled authoring via schemas)
- **Canonical source:** Markdown files. The backend is a rebuildable cache — not the source of truth.

### Three-layer type system

| Layer | Owner | Purpose |
|-------|-------|---------|
| **Registry Types** | User | Domain-specific doc_types defined in `_registry/object_types.yaml`. MAAD ships none. |
| **Extraction Primitives** | Engine | Fixed set of 11 primitives (`entity`, `date`, `duration`, `amount`, `measure`, `quantity`, `percentage`, `location`, `identifier`, `contact`, `media`) recognized in `[[...]]` annotations. Subtype labels normalize to their parent primitive but are preserved. Subtype map is extensible per project. |
| **Engine Records** | Engine | Materialized internals (`document`, `block`, `pointer`, `relationship`, `validation`) — index infrastructure, rebuildable from markdown. |

### Markdown syntax (2 inline constructs + YAML ID refs)

- `{{field}}` — read a YAML frontmatter value inline
- `[[type:value|label]]` — annotate inline text as an extractable object
- YAML ID refs (`client: cli-acme`) — reference registered objects by ID in frontmatter

### Engine pipeline (6 stages)

1. Load registry + schemas
2. Detect changed files (hash-based skip)
3. Parse source (frontmatter, blocks, `{{}}`, `[[]]`)
4. Bind schema + validate
5. Extract objects + normalize + create relationships
6. Materialize to backend (documents, fields, refs, block map, indexes)

### Backend

Pluggable via `MaadBackend` interface (7 methods). MVP: SQLite. The backend is always reconstructable from the markdown files.

### LLM tools (15 — see [MAAD-TOOLS.md](MAAD-TOOLS.md))

| Category | Tools |
|----------|-------|
| Discovery | `describe`, `schema`, `inspect` |
| CRUD | `create`, `get` (hot/warm/cold), `find`, `update`, `delete` |
| Navigation | `list_related`, `search_objects` |
| Audit | `history`, `diff`, `snapshot`, `audit` |
| Maintenance | `validate`, `reindex` |

### CLI

`maad init`, `maad parse`, `maad validate`, `maad reindex`, `maad query`

### Stack

TypeScript strict, Node.js 18+, `better-sqlite3`, `gray-matter`, Vitest. No heavy frameworks.

### Version control and audit

Git is the version control and audit layer. Every write auto-commits with structured messages. Four audit tools (`history`, `diff`, `snapshot`, `audit`) give the LLM full traceability without raw git access. See [Version Control and Audit via Git](#version-control-and-audit-via-git).

### What ships vs. what's demonstrated

- **Ships:** The framework — registry system, schema system, parser, extractor, backend adapter, git integration, LLM tools (15 total), CLI
- **Demonstrated with:** Simple CRM (structured), Meeting Notes (semi-structured), Investigation Report (freeform narrative)
- **Deferred:** Multi-user concurrency/locking, branching workflows, GPG signing, vector search, LLM inference extraction, reverse import converter tooling (architecture supports it; scripts are post-MVP)

---

## First Principles

1. **Markdown is the database.** The markdown file is the canonical record. It carries who, what, when, where, how, and the context tying it all together. Traditional databases hold fragments. Markdown preserves the full event, narrative, chronology, and surrounding evidence.

2. **MAAD is the parser and LLM indexing engine.** It reads markdown, detects and extracts key objects, attaches pointers back to exact source locations, and builds an index so the LLM can query first and read second.

3. **YAML is the curated interface language.** YAML defines object registration, field definitions, schema rules, extraction hints, formatting rules, and validation conventions. YAML syntax, MAAD semantics — only MAAD-approved keys and patterns are accepted.

4. **The backend is optional infrastructure.** A lightweight store (SQLite, LiteDB, MongoDB, Postgres) holds extracted objects, refs, hashes, and indexes for speed. It is not the conceptual center. Delete it and rebuild from markdown in one pass.

5. **Extracted objects are reference points, not truth.** They exist so the LLM can quickly find people, dates, amounts, events, roles, relationships — then return to the markdown for full context.

6. **MAAD works in both directions.**
   - **Forward:** markdown -> parser/LLM extraction -> objects -> index
   - **Reverse:** existing database/API records -> MAAD objects -> markdown records and/or direct LLM-readable object access

---

## Two Modes

MAAD gives the LLM two complementary working modes:

### Exploratory Mode (Speed-Read)

The LLM queries indexed objects, pointers, and targeted retrievals without reading entire files. The object index acts like cliff notes — the model can ask for dates, people, events, roles, places, and relationships, then jump into the exact markdown blocks that matter.

### Deterministic Mode (Controlled Authoring)

The LLM creates and updates markdown through registered objects, templates, and field rules. If you define that dates must be `YYYY-MM-DD`, that a case note must contain `author`, `noted_at`, and `case`, or that a meeting note must follow a formal template — the LLM writes through MAAD and produces predictable, repeatable output instead of the loose, inconsistent formatting typical of raw LLM generation.

This solves two problems at once:
- How an LLM **reads** markdown efficiently
- How an LLM **writes** markdown consistently

---

## Architecture

```text
Markdown source (canonical record)
  -> MAAD engine (parser + extractor + indexer)
  -> Curated YAML binding (schema, registry, rules)
  -> Extracted objects and pointers
  -> Backend adapter (pluggable store)
  -> LLM tool interface (query, read, create, update, delete)
```

```text
Markdown  = source, narrative, evidence, full contextual record
YAML      = structure, schema, object registration, extraction rules
Engine    = parser, validator, extractor, compiler
Backend   = pluggable object and pointer store
LLM       = query, navigate, create, update, delete through tools
```

### What Is Canonical

- Markdown file contents
- MAAD YAML schemas and object definitions

### What Is Materialized (Rebuildable)

- Extracted field values
- Normalized dates and amounts
- References between documents
- Query indexes
- Block maps
- Validation results

---

## MAAD YAML Profile

MAAD supports a constrained, enforced subset of YAML.

### Allowed

- Key/value maps
- Arrays
- Strings, numbers, booleans, null
- Shallow nesting
- Enums
- Explicit refs

### Disallowed in MVP

- Anchors and aliases
- Custom tags
- Multi-document YAML
- Implicit type tricks
- Deep polymorphic structures
- Arbitrary expressions

**Rule:** YAML syntax, MAAD semantics. The parser reads YAML, but only MAAD-approved keys and patterns are accepted.

---

## Object Registration

Object types are registered centrally in a registry file. The registry is domain-agnostic — it defines whatever types the user needs.

```yaml
# _registry/object_types.yaml
types:
  <type_name>:
    path: <directory>/
    id_prefix: <short_prefix>
    schema: <type_name>.v<version>

extraction:                        # optional: extend the subtype map
  subtypes:
    <subtype>: <primitive>
```

The registry tells the engine which object types exist, where they live, how IDs are formed, and which schema to load. MAAD does not ship with built-in registry types. The user defines them for their domain. (The engine does have a fixed set of 11 extraction primitives — see [Type System](#type-system).)

---

## Schema Definition

Each object type has a versioned schema. Schemas are user-defined — MAAD provides the schema system, not the schemas themselves.

```yaml
# _schema/<type>.v<version>.yaml
type: <type_name>
required:
  - doc_id
  - <field>
  - <field>
fields:
  <field_name>:
    type: string | number | date | enum | ref | boolean | list | amount
    index: true | false
    role: <optional semantic role>
    format: <optional format string>
    target: <optional ref target type>
    values: <optional enum values>
    default: <optional default value>
```

### Field Types

| Type | Description |
|------|-------------|
| `string` | Plain text |
| `number` | Numeric value |
| `date` | Date or datetime, with enforced format |
| `enum` | Constrained set of values |
| `ref` | Reference to another registered object by ID |
| `boolean` | True/false |
| `list` | Array of values |
| `amount` | Currency value with unit |

### Roles

A datatype alone is not enough. Every extracted object may also carry a role:

- `date.role = created_at` vs `transaction_date` vs `mentioned_date`
- `amount.role = payment` vs `invoice_total` vs `estimate`

Roles matter because the same type has different retrieval intents.

---

## Markdown Syntax

MAAD defines a small, explicit syntax inside markdown.

### 1. Read a YAML Key: `{{...}}`

Call a value from frontmatter or resolved document state.

```markdown
The following teams will play on Saturday: {{teams}}
Current status: {{status}}
```

### 2. Annotate an Inline Object: `[[type:value|label]]`

Tag visible text as a structured, extractable object. The `type` is an extraction primitive or a subtype label that normalizes to one (see [Type System](#type-system)).

```markdown
I play for the Miami [[team:Heat|Heat]].
Luis pays [[person:Bob|Bob]] [[amount:100.00 USD|$100]] on [[date:2026-02-25|2-25-26]].
```

Here `team` and `person` are subtype labels of the `entity` primitive. `amount` and `date` are primitives directly. The visible markdown stays readable. The parser extracts the type, value, and label.

### 3. Reference a Registered Object

Use IDs in YAML fields, not file paths.

```yaml
client: cli-acme
primary_contact: con-jane-smith
case: cas-2026-001
```

The backend resolves those IDs to source files.

### Raw vs Parsed

- **Raw markdown** stores source tags (`{{...}}`, `[[...]]`)
- **Parsed markdown** resolves them into rendered text
- **Backend** stores extracted objects and pointers

---

## Type System

MAAD has three distinct layers of types. Keeping them separate is important — they serve different purposes and live in different parts of the system.

### Layer 1: Registry Types (user-defined)

Domain-specific document types defined by the user in `_registry/object_types.yaml`. MAAD ships none. These drive schemas, file paths, ID generation, and CRUD operations.

Examples: `client`, `contact`, `case`, `case_note`, `meeting_note`, `report`

A `doc_type` in frontmatter must match a registered type. The registry is the user's domain model.

### Layer 2: Extraction Primitives (engine-recognized)

A fixed set of 11 value types the parser recognizes inside `[[type:value|label]]` inline annotations. Each primitive has a distinct normalization behavior — that's the test for whether something is a primitive. Derived from NER (Named Entity Recognition) standard types, extended with database and systems concepts.

| Primitive | Normalization | Example |
|-----------|--------------|---------|
| `entity` | Preserve string | `[[person:Bob|Bob]]`, `[[org:Acme|Acme Corp]]` |
| `date` | -> ISO 8601 date/datetime | `[[date:2026-03-28|March 28]]` |
| `duration` | -> ISO 8601 duration (PT3H, P2W) | `[[duration:3 hours|three hours]]` |
| `amount` | -> number + currency code | `[[amount:100.00 USD|$100]]` |
| `measure` | -> number + unit | `[[measure:500mg|500mg]]`, `[[measure:6 feet|six feet]]` |
| `quantity` | -> number (bare count) | `[[quantity:42|forty-two]]` |
| `percentage` | -> decimal (0.15) | `[[percentage:15%|15 percent]]` |
| `location` | Preserve string | `[[location:415 Elm St|415 Elm]]` |
| `identifier` | Preserve string, flag as lookup key | `[[identifier:INV-2026-0042|Invoice 42]]` |
| `contact` | Sub-normalize: email, phone, URL | `[[contact:jane@acme.com|Jane's email]]` |
| `media` | Path resolution + media type detection | `[[image:evidence/photo-001.jpg|crime scene photo]]` |

**Numeric hierarchy:** Four primitives handle numbers with different metadata — `quantity` (bare count), `percentage` (ratio), `amount` (number + currency), `measure` (number + unit).

**Subtype labels:** Inline annotations can use descriptive labels like `[[person:Bob|Bob]]` or `[[team:Heat|Heat]]`. At index time, the engine normalizes these to their parent primitive — `person` and `team` both index as `entity` — but the original subtype label is preserved as metadata. Queries can filter by either the primitive (`entity`) or the specific label (`person`).

**Extensible subtype map:** The default subtype-to-primitive mapping is built into the engine, but projects can extend it in the registry:

```yaml
# _registry/object_types.yaml
extraction:
  subtypes:
    vehicle: entity
    officer: entity
    suspect: entity
    filing_date: date
    bid_amount: amount
    dosage: measure
```

Extraction primitives do not require registry entries. They exist so the parser can pull structured data out of freeform narrative without the user having to register every noun.

### Layer 3: Engine Records (materialized internals)

Internal artifacts the engine creates and manages in the backend during the materialize stage. These are not user-facing types and not used in `[[...]]` annotations — they are the index infrastructure.

| Record | Purpose |
|--------|---------|
| `document` | Metadata for a source markdown file (hash, path, doc_type, version) |
| `block` | A stable markdown section (heading-delimited, with line range) |
| `pointer` | A link from an extracted object back to its exact source location |
| `relationship` | A typed edge between two objects (ref fields, inline mentions) |
| `validation` | Schema validation state for a document |

Engine records are rebuildable from markdown. They exist for query speed, not as truth.

---

## Engine Pipeline

The engine behaves like a small compiler with six stages.

### Stage 1: Load Registry

- Read `_registry/object_types.yaml`
- Load all referenced schemas
- Validate type names and ref targets

### Stage 2: Detect Changes

- Scan registered paths
- Hash file contents
- Skip unchanged files (fast path)

### Stage 3: Parse Source

- Parse YAML frontmatter
- Split markdown body into blocks (heading-delimited)
- Collect `{{...}}` value calls
- Collect `[[type:value|label]]` annotations
- Assign stable block IDs where possible

### Stage 4: Bind Schema

- Match document to `doc_type` and schema version
- Validate required fields
- Validate field types and enums
- Validate ref targets exist

### Stage 5: Extract Objects

- Extract indexed fields from frontmatter
- Extract inline annotated objects from markdown body
- Normalize dates, amounts, quantities, and refs
- Assign roles where schema defines them
- Create relationship edges between objects

### Stage 6: Materialize

- Write document metadata to backend
- Write extracted field values
- Write references and relationships
- Write block map (heading -> line range)
- Update query indexes

### Parser Speed

For MVP, the fast path is:
- File hash check (skip unchanged)
- Frontmatter parse
- Markdown block scan
- Explicit tag extraction

Full semantic inference and LLM-assisted extraction are later layers.

---

## Backend Adapter

The backend is hidden behind an adapter interface. The engine does not care which store is used.

### Minimal Backend Contract

```ts
interface MaadBackend {
  putDocument(doc: ParsedDocument): Promise<void>;
  putObjects(objects: ExtractedObject[]): Promise<void>;
  putRelations(relations: Relation[]): Promise<void>;
  findDocuments(query: FindDocumentsQuery): Promise<DocumentMatch[]>;
  findObjects(query: FindObjectsQuery): Promise<ObjectMatch[]>;
  getDocument(docId: string): Promise<DocumentRecord | null>;
  resolveRef(ref: string): Promise<DocumentRecord | null>;
}
```

### MVP Backend

SQLite is the recommended MVP backend. Simple, zero-config, single-file, fast enough.

---

## LLM Tool Surface

MAAD is a tool for LLMs, not for humans. The primary interface is an MCP (Model Context Protocol) server that exposes 11 tools across four categories. The LLM never touches the filesystem directly.

Full tool definitions with input/output JSON schemas, response examples, and typical workflows are in **[MAAD-TOOLS.md](MAAD-TOOLS.md)**.

| Category | Tools | Purpose |
|----------|-------|---------|
| **Discovery** | `describe`, `schema`, `inspect` | Understand the project before acting |
| **CRUD** | `create`, `get`, `find`, `update`, `delete` | Read and write records |
| **Navigation** | `list_related`, `search_objects` | Traverse relationships and search extracted objects |
| **Audit** | `history`, `diff`, `snapshot`, `audit` | Version history, change diffs, point-in-time reads, project-wide activity |
| **Maintenance** | `validate`, `reindex` | Verify integrity and rebuild index |

Key design points:

- **`describe` first** — the LLM calls this on first contact to learn what types and schemas exist
- **`find` then `get`** — query the index for IDs, then read specific documents at the needed depth
- **Tiered reads** — `get` supports `hot` (frontmatter), `warm` (frontmatter + block), `cold` (full document)
- **Schema-enforced writes** — `create` and `update` validate against the schema before touching the file
- **Object search** — `search_objects` queries across all documents for extraction primitives (people, dates, amounts) without knowing which files contain them

---

## Three-Tier Read Model

| Tier | What | Token Cost | When |
|------|------|------------|------|
| **Hot** | Frontmatter + index metadata | Minimal | Most queries. Who, what, when, status. |
| **Warm** | Frontmatter + targeted block | Low | Need a specific section (timeline, notes). |
| **Cold** | Full document | High | Need the complete narrative record. |

The LLM specifies the tier. The engine enforces it. Most queries never leave Hot.

---

## Deterministic Authoring

When the LLM writes through MAAD tools, the system enforces whatever rules the schema defines:

- **Field formats** — dates, amounts, IDs conform to schema-defined formats
- **Required fields** — schema rejects writes missing required keys
- **Enum constraints** — fields locked to defined values
- **Document templates** — registered doc_types produce consistent frontmatter and heading structure
- **Object tags** — inline `[[type:value|label]]` annotations follow the registry
- **Section structure** — formal templates define which headings appear and in what order

This means the LLM does not guess the markdown shape. It writes through MAAD and the output is predictable, repeatable, and machine-parseable on the next read.

---

## Version Control and Audit via Git

MAAD's source of truth is plain text markdown files. Git is already the best version control system for plain text. Instead of building a custom version chain or audit engine, MAAD delegates to git — and gets immutable history, diffable changes, point-in-time reads, rollback, and a complete audit trail for free.

### What git provides

| Capability | Git mechanism | Custom build cost |
|------------|---------------|-------------------|
| Immutable version chain | Commits (SHA-hashed, append-only) | Zero |
| Full audit trail | `git log` (who, when, what, message) | Zero |
| Diffable changes | `git diff` (line-level, per-file) | Zero |
| Point-in-time reads | `git show <sha>:<path>` | Zero |
| Rollback | `git revert` / `git checkout` | Zero |
| Conflict detection | Merge conflicts | Zero |
| Signing / compliance | GPG commit signing | Zero |
| Collaboration | Push/pull, branching, PRs | Zero |

### What gets versioned

- Markdown files (the canonical records)
- `_registry/object_types.yaml`
- `_schema/*.yaml`

### What does not get versioned

- `_backend/` — gitignored, rebuildable from markdown in one pass

### Auto-commit on write

Every MAAD write operation (`create`, `update`, `delete`) auto-commits with a structured, machine-parseable commit message:

```
maad:create cli-acme [client] — Acme Corporation
maad:update cas-2026-001 [case] fields:status — status: open -> pending
maad:update cas-2026-001 [case] body:append — Added resolution block
maad:delete note-2026-04-06-001 [case_note] soft — Removed duplicate note
```

**Format:** `maad:<action> <doc_id> [<doc_type>] <detail> — <human_summary>`

This gives:
- **Machine-parseable commits** — prefix + structured fields, filterable by action, doc_id, or doc_type via `git log --grep`
- **Human-readable summaries** — the part after `—` is natural language
- **Full traceability** — every change to every record is attributed, timestamped, and permanent

### Batch commits

When a single logical operation touches multiple files (e.g. creating a case that also updates the client's reference list), MAAD groups the changes into a single commit. One logical action = one commit.

### LLM audit tools

The LLM queries history through MAAD tools, not raw git. Four audit tools wrap git operations and return structured results. Full schemas in [MAAD-TOOLS.md](MAAD-TOOLS.md).

**`maad.history`** — what happened to this document?

```ts
maad.history({ doc_id: "cas-2026-001", limit: 10 })
// -> [
//   { commit: "a1b2c3", action: "update", fields: ["status"],
//     summary: "status: open -> pending", author: "system",
//     timestamp: "2026-04-06T15:00:00Z" },
//   { commit: "d4e5f6", action: "create",
//     summary: "Contract Review Dispute", author: "system",
//     timestamp: "2026-04-01T09:00:00Z" }
// ]
```

**`maad.diff`** — what changed between two versions?

```ts
maad.diff({ doc_id: "cas-2026-001", from: "d4e5f6", to: "a1b2c3" })
// -> {
//   frontmatter_changes: { status: { from: "open", to: "pending" } },
//   body_diff: "@@ -14,3 +14,7 @@\n+## Resolution {#resolution}\n+..."
// }
```

**`maad.snapshot`** — what did this look like at a point in time?

```ts
maad.snapshot({ doc_id: "cas-2026-001", at: "2026-03-15" })
// -> returns the full document as it existed at that date
//    (frontmatter + body, same format as maad.get with depth "cold")
```

**`maad.audit`** — what changed across the project?

```ts
maad.audit({ since: "2026-04-01", doc_type: "case" })
// -> [
//   { doc_id: "cas-2026-001", actions: 3, last_action: "update",
//     last_author: "system", last_timestamp: "2026-04-06T15:00:00Z" },
//   { doc_id: "cas-2026-003", actions: 1, last_action: "create",
//     last_author: "system", last_timestamp: "2026-04-02T10:00:00Z" }
// ]
```

### What this means for the engine

The engine needs a thin git integration layer:

1. **`maad init`** initializes a git repo (or validates one exists) and creates `.gitignore` with `_backend/`
2. **Write operations** (`create`, `update`, `delete`) call `git add` + `git commit` after successful file write and reindex
3. **Audit tools** (`history`, `diff`, `snapshot`, `audit`) wrap `git log`, `git diff`, and `git show` and parse the structured commit messages
4. **Commit messages** follow the `maad:<action> <doc_id> [<doc_type>] <detail> — <summary>` convention

That's it. No custom version store. No custom audit event table. Git is the audit layer.

### What stays deferred

- **Branching workflows** — draft/review/approve via git branches (powerful but post-MVP)
- **GPG commit signing** — trivial to enable for compliance, not MVP-critical
- **Multi-user conflict resolution UI** — git handles the merge mechanics; a visual resolver is post-MVP
- **Remote push/sync** — the engine works locally; push to GitHub/GitLab is a user choice, not engine responsibility

---

## Bidirectional: Reverse Import

Existing databases can be converted into MAAD:

1. Export records from SQL, Dataverse, Access, API, etc.
2. Map fields to MAAD object types and schemas
3. Generate markdown files with frontmatter and body
4. Run the engine to index

The LLM can then work through MAAD instead of direct SQL or API access. The data becomes portable, human-readable, git-trackable, and AI-traversable.

---

## Example Projects

These are not part of the framework — they are demonstrations that prove the engine works across different levels of structure. Each example is a standalone MAAD project with its own registry, schemas, and records.

### Example 1: Simple CRM (Highly Structured)

Proves: registry, schemas, refs, CRUD, relationship traversal, deterministic authoring.

```yaml
# _registry/object_types.yaml
types:
  client:
    path: clients/
    id_prefix: cli
    schema: client.v1
  contact:
    path: contacts/
    id_prefix: con
    schema: contact.v1
  case:
    path: cases/
    id_prefix: cas
    schema: case.v1
  case_note:
    path: case-notes/
    id_prefix: note
    schema: case_note.v1
```

Sample records:

```markdown
---
doc_id: cli-acme
doc_type: client
schema: client.v1
name: Acme Corporation
status: active
primary_contact: con-jane-smith
tags: [enterprise, priority]
---

# Acme Corporation

Primary client record. Strategic account with open litigation support work.
```

```markdown
---
doc_id: cas-2026-001
doc_type: case
schema: case.v1
title: Contract Review Dispute
client: cli-acme
primary_contact: con-jane-smith
status: open
opened_at: 2026-04-01
priority: high
---

# Contract Review Dispute {#summary}

Dispute over delivery obligations and late change requests.

## Timeline {#timeline}

Initial issue raised on [[date:2026-03-28|March 28, 2026]].
```

### Example 2: Meeting Notes (Semi-Structured)

Proves: extraction from looser markdown, list fields, date normalization.

```markdown
---
doc_id: note-mtg-2025-01-21
doc_type: meeting_note
schema: meeting_note.v1
date: 2025-01-21
participants: [John K, Mary, Jim, Nancy Wright]
---

# Meeting Notes

12:00 PM — Called meeting to order.

- Discussed Jim's birthday
- Brought to a vote to recognize Jim on his birthday
- First order of business: repair tennis courts
- Request new bids

Meeting closed.
```

### Example 3: Freeform Narrative (Unstructured)

Proves: inline `[[...]]` annotation extraction, entity and date primitives extracted from narrative text, subtype labels (`person`, `location`) preserved alongside `entity` primitive.

```markdown
---
doc_id: report-investigation-001
doc_type: report
schema: report.v1
title: Investigation Summary
date: 2026-03-15
---

# Investigation Summary

On the morning of March 12, [[person:Officer Davis|Officer Davis]] responded to a call
at [[location:415 Elm Street|415 Elm Street]]. The complainant, [[person:Maria Torres|Maria Torres]],
reported that an unauthorized entry had occurred sometime between [[date:2026-03-11|March 11]]
and [[date:2026-03-12|March 12]].

No suspects were identified at the scene. [[person:Officer Davis|Davis]] noted damage to the
rear door frame and collected photographic evidence.
```

All three examples produce usable indexed objects. The engine does not require neat structure to be useful.

---

## File Structure

### Framework (the MVP)

```
maad/
  src/
    parser/              # frontmatter, blocks, {{...}}, [[type:value|label]]
    schema/              # schema loader, validator
    registry/            # object type registry loader
    extractor/           # object extraction from parsed source
    backend/
      adapter.ts         # MaadBackend interface
      sqlite.ts          # SQLite implementation
    git/                 # auto-commit, structured messages, audit queries
    tools/               # MCP tool definitions (15 tools across 5 categories)
    engine.ts            # orchestrates the 6-stage pipeline
    server.ts            # MCP server entry point (maad serve)
    cli.ts               # CLI entry point
  tests/
  package.json
  tsconfig.json
```

### A MAAD Project (user-created, any domain)

```
my-project/                    # git repo (initialized by maad init)
  .gitignore                   # ignores _backend/
  _registry/
    object_types.yaml          # user defines their types here
  _schema/
    <type>.v1.yaml             # one schema per type
    <type>.v1.yaml
  <type_folder>/
    <record>.md                # markdown records — git-versioned
  <type_folder>/
    <record>.md
  _backend/                    # gitignored — rebuildable cache
    maad.db                    # SQLite (MVP)
```

---

## MVP Scope

The MVP is the **framework and engine** — domain-agnostic. It ships no built-in registry types. The user defines their own registry, schemas, and records. The engine provides extraction primitives and engine records out of the box (see [Type System](#type-system)). We then demonstrate it with a few example projects.

### Build (the framework)

- MAAD YAML profile (constrained subset, validation)
- Object registry system (loader, validator)
- Schema system (loader, field type validation, ref resolution)
- Markdown parser: frontmatter, blocks, `{{...}}`, `[[type:value|label]]`
- Schema validator (fires on read and write)
- Object extractor (frontmatter fields + inline annotations)
- Backend adapter interface + SQLite implementation
- Git integration: auto-commit on write with structured commit messages, `.gitignore` for `_backend/`
- MCP server exposing 15 LLM tools (see [MAAD-TOOLS.md](MAAD-TOOLS.md)): discovery (`describe`, `schema`, `inspect`), CRUD (`create`, `get`, `find`, `update`, `delete`), navigation (`list_related`, `search_objects`), audit (`history`, `diff`, `snapshot`, `audit`), maintenance (`validate`, `reindex`)
- Deterministic authoring: template generation and field enforcement on write
- CLI: `maad init`, `maad parse`, `maad validate`, `maad reindex`, `maad query`, `maad serve`

### Demonstrate (example projects)

- **Simple CRM** — client, contact, case, case_note types. Proves refs, schema, CRUD, relationship traversal.
- **Meeting notes** — semi-structured. Proves extraction from looser markdown.
- **Freeform narrative** — investigation report or similar. Proves inline `[[...]]` annotation extraction across unstructured text.

### Defer

- Advanced formula/expression language
- Multi-user concurrency and locking
- Git branching workflows (draft/review/approve)
- GPG commit signing for compliance
- Multi-user conflict resolution UI
- Vector search integration
- LLM-assisted inference extraction (MVP uses deterministic extraction only)
- Obsidian plugin
- Reverse import converter tooling (the architecture supports reverse import; converter scripts are post-MVP)

---

## Implementation

- **Language:** TypeScript, strict mode
- **Runtime:** Node.js v18+
- **Style:** Small, focused modules. No heavy frameworks.
- **Backend:** SQLite via `better-sqlite3` (MVP)
- **Git:** `simple-git` for auto-commit and audit queries
- **Markdown parsing:** `gray-matter` (frontmatter) + custom block/tag parser
- **Testing:** Vitest
- **CLI:** Lightweight — direct script or minimal CLI lib
- **MCP Server:** `maad serve` exposes all 15 tools via MCP stdio transport

---

## Why Markdown Is the Database of the Future

Traditional databases are good at storing fragments. They capture enough to run a transaction, generate a report, or match a query. But they structurally cannot capture the full picture of what actually happened — and they never could.

### The Five W's Problem

Every real event has six dimensions: Who, What, When, Where, How, and Why. Traditional databases cover parts of each — but leave critical gaps in every dimension, and miss one entirely.

| Dimension | What databases capture | What databases miss |
|-----------|----------------------|---------------------|
| **Who** | id, user_id, org_id | role, permissions, actor — *who someone was in context* |
| **What** | type, category, enum | name, description, payload — *the actual substance* |
| **When** | datetime, timestamp, duration | sequence, order, version — *the chronological narrative* |
| **Where** | coordinates, region | locale, timezone, ip_address — *contextual location* |
| **How** | score, vector | method, source, channel, metadata — *the process* |
| **Why** | **nothing** | reason, intent, context — *the entire motivational layer* |

This is not a tooling gap. It is a structural limitation. Relational databases were designed to store facts, not stories. They can tell you *that* something happened. They cannot tell you *why*.

### Why matters most

The "Why" row is the critical one. A database can record that a case was closed on March 15. It cannot record that the case was closed because the client changed strategy after a board meeting where the CFO overruled the legal team's recommendation to proceed.

That context — the reason, the intent, the chain of decisions — is exactly what an LLM needs to answer real questions. And it is exactly what a markdown record can carry naturally, because markdown is a narrative format.

A database row says: `status: closed, closed_at: 2026-03-15, closed_by: user-47`.

A markdown record says:

```markdown
## Resolution {#resolution}

Case closed on [[date:2026-03-15|March 15, 2026]] following client instruction.
[[person:CFO Linda Park|Linda Park]] overruled the legal team's recommendation to proceed,
citing cost exposure after the Q1 board review. [[person:Jane Smith|Jane]] confirmed the
decision via email on [[date:2026-03-14|March 14]].

The settlement was not accepted. The client chose to walk away.
```

Both records say the case closed. Only one tells you why. Only one gives an LLM enough context to reason about what happened.

### The pattern across domains

This is not a niche problem. It shows up everywhere data matters:

- **Legal** — the case file is not the docket fields; it is the chain of motions, arguments, and decisions
- **Medical** — the patient record is not the billing codes; it is the doctor's notes, the nurse's observations, and the timeline of symptoms
- **Investigations** — the report is not the incident number; it is who said what, when, and what happened before and after
- **Government** — the record is not the form submission; it is the correspondence, the reasoning, and the audit trail
- **Internal ops** — the project history is not the ticket statuses; it is the meeting notes, the decisions, and the context behind scope changes
- **Institutional memory** — the knowledge is not in the org chart; it is in the accumulated narrative of how decisions were made and why

In every case, the narrative record — the markdown — carries the dimensions that the database structurally cannot. The database holds the skeleton. The markdown holds the story.

### Why now

Two things changed:

1. **LLMs read markdown natively.** No ORM, no schema translation, no prompt-engineering around SQL results. Markdown is the format LLMs already think in.
2. **LLMs need context to reason.** A row lookup answers a field query. A markdown record with indexed objects lets the LLM traverse the full chain of events and answer *why* — which is the question that actually matters.

MAAD exists because the gap between what databases capture and what LLMs need is exactly the gap that markdown fills. The indexed objects give the LLM fast navigation. The markdown gives it the full story. Together, they make the first database format that covers all six dimensions — including Why.

**MAAD gives LLMs both a speed-read layer and a deterministic authoring layer for markdown — the only format that can carry the complete record.**

---

*The MVP is the framework and engine. The examples prove it works. The goal is a domain-agnostic system that can parse, index, and generate markdown databases for any use case — then demonstrate it with a simple CRM, meeting notes, and freeform narrative.*
