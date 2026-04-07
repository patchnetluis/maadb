# MAAD Codex

> A focused MVP spec for MAAD as markdown plus curated YAML plus a pluggable object index.

## One-Line Definition

MAAD is a markdown-native data system where markdown is the source artifact, curated YAML is the interface language, and a backend index stores extracted objects and pointers so an LLM can query structure before reading full files.

## Recap

This version reflects the current design direction:

- markdown remains the primary source artifact
- YAML is the real protocol layer
- raw markdown can contain tags and object markers
- parsed markdown resolves tags into rendered output
- the backend stores extracted objects and reference pointers
- the backend is replaceable
- auditability and immutable version chains are a roadmap item, not an MVP blocker

## Core Idea

Most business systems force data into one of two bad shapes:

- rigid structured tables too early
- markdown or text blobs with no usable structure

MAAD inverts that.

Instead of asking the LLM to digest a whole markdown corpus, MAAD lets the system:

1. parse markdown
2. bind it to a curated YAML schema
3. extract typed objects
4. store object pointers in a queryable backend
5. read full markdown only when needed

## Architecture

```text
Markdown source
  -> MAAD parser
  -> curated YAML binding
  -> extracted objects and pointers
  -> backend adapter
  -> LLM tool interface
```

```text
Markdown = source and narrative evidence
YAML = structure, schema, object registration, extraction rules
Engine = parser, validator, extractor, compiler
Backend = pluggable object and pointer store
LLM = query, navigate, create, update, delete through tools
```

## What Is Canonical

### Canonical

- markdown file contents
- MAAD YAML schemas and object definitions

### Materialized

- extracted field values
- normalized dates and amounts
- references between documents
- query indexes
- block maps
- validation results

### Roadmap Materialized State

- immutable document versions
- pointer snapshots by version
- deltas and rollback chains
- audit events

## The Secret Sauce

The real product is not the backend.

The real product is:

- the curated YAML language
- the markdown tag syntax
- the parser/extractor engine
- the backend adapter contract

If those are stable, the backend can vary:

- SQLite
- Postgres
- MongoDB
- graph store
- flat indexed files

The backend is an implementation choice. The YAML contract is the core.

## MAAD YAML Profile

MAAD should not support arbitrary YAML.

It should support a constrained and enforced subset of YAML for:

- object registration
- schema definition
- field typing
- references
- extraction rules
- indexing hints
- validation rules

### Allowed

- key/value maps
- arrays
- strings
- numbers
- booleans
- null
- shallow nesting
- enums
- explicit refs

### Deferred Or Disallowed In MVP

- anchors and aliases
- custom tags
- multi-document YAML
- implicit type tricks
- deep polymorphic structures
- arbitrary expressions everywhere

### Rule

YAML syntax, MAAD semantics.

The parser can read YAML, but only MAAD-approved keys and patterns should be accepted.

## Object Registration

Object types should be registered centrally.

Example:

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

This registry tells the engine:

- which object types exist
- where they live
- how IDs are formed
- which schema to load

## Schema Example

```yaml
# _schema/case.v1.yaml
type: case
required:
  - doc_id
  - title
  - client
  - status
fields:
  title:
    type: string
    index: true
  client:
    type: ref
    target: client
    index: true
  primary_contact:
    type: ref
    target: contact
    index: true
  status:
    type: enum
    values: [open, pending, closed]
    index: true
  opened_at:
    type: date
    role: created_at
    index: true
  priority:
    type: enum
    values: [low, medium, high]
    index: true
```

## Markdown Syntax

MAAD needs a very small, explicit syntax inside markdown.

### 1. Read A YAML Key

Use `{{...}}` to call a value from frontmatter or resolved document state.

```markdown
The following teams will play on Saturday: {{teams}}
Current status: {{status}}
```

### 2. Set Or Annotate An Object Inline

Use `[[type:value|label]]` to tag visible text as a structured object.

```markdown
I play for the Miami [[team:Heat|Heat]].
Luis pays [[person:Bob|Bob]] [[amount:100.00 USD|$100]] on [[date:2026-02-25|2-25-26]].
```

The visible markdown stays readable, but the parser extracts object type and value.

### 3. Reference Another Registered Object

Use IDs in YAML fields, not file paths.

```yaml
client: cli-acme
primary_contact: con-jane-smith
case: cas-2026-001
```

The backend resolves those IDs.

## Raw Markdown Vs Parsed Output

Raw markdown contains tags and annotations.

Example:

```markdown
---
teams: [Heat, Magic, Lakers]
---

The following teams will play on Saturday: {{teams}}

I play for the Miami [[team:Heat|Heat]].
```

Parsed output becomes:

- rendered text:
  - `The following teams will play on Saturday: Heat, Magic, Lakers`
  - `I play for the Miami Heat.`
- extracted objects:
  - `teams = [Heat, Magic, Lakers]`
  - `team = Heat`

This is the key split:

- raw markdown stores the source tags
- parsed markdown resolves them
- the backend stores extracted objects and pointers

## Universal Objects

MAAD should keep the truly universal object set small.

### Core Universal Objects

| Object | Purpose |
|---|---|
| `document` | a source markdown file |
| `block` | a stable markdown section |
| `pointer` | a link from extracted data to source |
| `entity` | a person, org, product, or named thing |
| `date` | a normalized date or datetime |
| `amount` | a currency value |
| `quantity` | a count or measured value |
| `calc` | a derived numeric or structured value |
| `relationship` | a typed edge between objects |
| `validation` | schema and extraction state |

### Important Rule

A datatype alone is not enough.

Every extracted object may also need a role.

Example:

- `date.value = 2026-02-25`
- `date.role = transaction_date`

Roles matter because:

- `created_at`
- `event_date`
- `mentioned_date`
- `transaction_date`

are all different retrieval intents.

## MVP Domain Model

The first MVP should prioritize domain objects over abstract generality.

Start with:

- `client`
- `contact`
- `case`
- `case_note`

These are enough to prove:

- document identity
- object registration
- references
- schema validation
- query-first retrieval
- AI-mediated CRUD

### Example Client Document

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

### Example Case Document

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

### Example Case Note

```markdown
---
doc_id: note-2026-04-06-001
doc_type: case_note
schema: case_note.v1
case: cas-2026-001
author: system
noted_at: 2026-04-06T14:30:00Z
note_type: update
---

# Case Note

Client confirmed they want revised contract language by Friday.
```

## Accounting Direction

Accounting remains in scope, but should be treated as a later domain layer, not the MVP starting point.

The right mental model is:

- markdown records the source event
- YAML defines the object grammar
- the parser breaks the event into typed objects
- the backend stores those objects and relationships

Example:

```markdown
Luis pays [[person:Bob|Bob]] [[amount:100.00 USD|$100]] on [[date:2026-02-25|2-25-26]].
```

Possible extracted objects:

- payer: Luis
- payee: Bob
- amount: 100.00 USD
- transaction_date: 2026-02-25

Later, domain templates can map those objects into accounting postings.

## Engine Structure

The engine should behave like a small compiler.

### Stage 1: Load Registry

- read object registry
- load MAAD schemas
- validate type names and ref targets

### Stage 2: Detect Changes

- scan registered paths
- hash file contents
- skip unchanged files

### Stage 3: Parse Source

- parse frontmatter
- parse markdown blocks
- collect `{{...}}` calls
- collect `[[type:value|label]]` annotations
- assign stable block IDs where possible

### Stage 4: Bind Schema

- bind document to `doc_type`
- validate required fields
- validate field types
- validate refs

### Stage 5: Extract Objects

- extract indexed fields from frontmatter
- extract inline annotated objects from markdown
- normalize dates, amounts, quantities, and refs
- create relationships between objects

### Stage 6: Materialize

- write document metadata
- write extracted field values
- write references
- write block map
- update indexes

## What Determines Parser Speed

Parser speed mostly depends on:

- how much of each file is parsed
- how many tags and extraction rules are evaluated
- whether only changed files are reparsed
- how much cross-document resolution happens during parse

For MVP, the fast path should be:

- file hash check
- frontmatter parse
- markdown block scan
- explicit tag extraction

Full semantic inference can come later.

## Backend Adapter

The backend should be hidden behind an adapter interface.

The engine should not care whether the backend is:

- SQLite
- MongoDB
- Postgres
- an in-memory index

It should care only that the backend can:

- store documents
- store indexed fields
- store extracted objects
- store references
- query by type and field
- resolve object IDs back to source files

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

## LLM Tool Surface

The LLM should interact through a small set of explicit tools.

### Create

```ts
maad.create({
  doc_type: "client",
  fields: {
    name: "Acme Corporation",
    status: "active"
  },
  body: "Primary client record."
})
```

### Read

```ts
maad.get({
  doc_id: "cas-2026-001",
  depth: "full"
})
```

### Find

```ts
maad.find({
  doc_type: "case",
  filters: {
    client: "cli-acme",
    status: "open"
  }
})
```

### Update

```ts
maad.update({
  doc_id: "cas-2026-001",
  fields: {
    status: "pending"
  }
})
```

### Delete

```ts
maad.delete({
  doc_id: "note-2026-04-06-001",
  mode: "soft"
})
```

### Relationship Query

```ts
maad.list_related({
  doc_id: "cli-acme",
  relation_types: ["contacts", "cases"]
})
```

### Validation And Indexing

```ts
maad.validate({
  doc_id: "cas-2026-001"
})
```

```ts
maad.reindex({
  doc_id: "cas-2026-001"
})
```

## CRUD Model

### Create

- create markdown file from registry and schema
- assign `doc_id`
- validate
- index immediately

### Read

- query index first
- resolve markdown second
- return metadata, blocks, or full document depending on requested depth

### Update

- edits happen through MAAD tools
- rewrite markdown safely
- reparse and refresh index

### Delete

- soft delete for MVP by default
- hard delete optional later

## Auditability Roadmap

Auditability is important, but it should not overcomplicate the MVP.

### MVP

- store current file hash
- reindex on change
- keep source markdown as the human-readable record

### Later

- immutable document versions
- pointer snapshots per version
- delta chains
- rollback support
- audit events for tool actions

## Recommended Implementation

The MVP should be built in TypeScript on Node.js.

Why:

- strong fit for schema-driven code
- easy file system access
- strong markdown and YAML ecosystem
- straightforward LLM tool integration
- clean path to CLI and server interfaces

Recommended approach:

- strict TypeScript
- no framework-heavy architecture
- small parser modules
- explicit backend adapter

## Recommended V1 Scope

Build these first:

- curated MAAD YAML profile
- object registry
- schemas for `client`, `contact`, `case`, `case_note`
- markdown parser for frontmatter, blocks, `{{...}}`, and `[[type:value|label]]`
- backend adapter
- LLM tools for create, get, find, update, delete

Defer these:

- full accounting ledger
- advanced formula language
- multi-user concurrency
- immutable version chains
- enterprise audit engine
- vector search as a dependency

## Working Definition

MAAD is a markdown-first object compiler for LLMs.

It turns markdown from passive text into a structured, queryable system by using curated YAML to define how objects are registered, extracted, referenced, and resolved.
