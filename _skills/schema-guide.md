# Schema Guide

## Overview

Every MAAD record type needs two things:
1. A type entry in `_registry/object_types.yaml`
2. A schema file in `_schema/<type>.v<version>.yaml`

This guide covers how to build both. Read this before creating or modifying schemas.

## Master vs Transaction Records

Before designing schemas, classify each type:

| Pattern | Description | File strategy | When to use |
|---------|-------------|---------------|-------------|
| **Master** | Standalone identity. Created once, updated occasionally. | One file per record in `data/<type>/` | <1,000 records/year |
| **Transaction** | Belongs to a parent. Created constantly, rarely updated. | Append blocks to parent file in `data/<type>/` | >1,000 records/year |

### Decision rule

**Will this type generate more than 1,000 records per year?**
- No → master (one file per record, `maad.create`)
- Yes → transaction (append to parent file, `maad.update --append`)

When in doubt, start with master. You can always migrate to transaction later if volume demands it. Going the other direction is harder.

### Master record structure

```
data/papers/
  pap-001.md          ← one paper per file
  pap-002.md
```

Each file has full frontmatter and body content. The file IS the record.

### Transaction record structure

```
data/case-notes/
  notes-cas-001.md    ← all notes for case 001 (appended over time)
  notes-cas-002.md    ← all notes for case 002
```

Each entry is a headed block inside the file:

```markdown
## 2024-03-05 — Mediation Session {#note-010}

Day-long mediation with Judge Vasquez. No resolution. Opposing at $950K.
```

The engine indexes each block with line pointers. Individual entries are addressable via `maad.get warm <doc_id> <block_id>`.

### Why this matters

100 agents x 10 notes/day x 365 days = 365,000 files if each note is a file. That kills the file system, git, and reindex. Group transaction records into one file per parent instead.

## Registry Entry

Every type gets an entry in `_registry/object_types.yaml`:

```yaml
types:
  paper:
    path: data/papers/
    id_prefix: pap
    schema: paper.v1
  feedback:
    path: data/feedback/
    id_prefix: fb
    schema: feedback.v1
```

**Rules:**
- `path` always starts with `data/`. Records never live at the project root.
- `id_prefix` is a short unique prefix for auto-generated IDs (e.g., `pap-001`, `fb-002`).
- `schema` references a file in `_schema/` (without the `.yaml` extension).

## Schema File

Each type gets a schema file in `_schema/`:

```yaml
# _schema/paper.v1.yaml
type: paper
required:
  - doc_id
  - title
fields:
  title:
    type: string
    index: true
  authors:
    type: list
    index: false
    itemType: string
  year:
    type: number
    index: true
  journal:
    type: string
    index: true
  keywords:
    type: list
    index: false
    itemType: string
  abstract:
    type: string
    index: false
  doi:
    type: string
    index: true
  source_file:
    type: string
    index: false
  source_hash:
    type: string
    index: true
```

## Field Types

| Type | Description | Index behavior | Example values |
|------|-------------|---------------|----------------|
| `string` | Plain text | Exact match, contains | "Apex Corp", "jane@co.com" |
| `number` | Numeric value | Range queries (gt, lt, gte, lte) | 42, 3.14, 2024 |
| `date` | ISO date | Lexicographic range | "2024-03-15" |
| `enum` | Constrained values | Exact match | "active", "closed" |
| `ref` | Reference to another record | Exact match. Creates relationship edge. | "cli-001" |
| `boolean` | true/false | Exact match | true, false |
| `list` | Array of values | Per-item indexing with `itemType` | ["tag1", "tag2"] |
| `amount` | Currency value | Numeric range on extracted value | "1250.00 USD" |

### Field type details

**enum** — requires a `values` list:
```yaml
status:
  type: enum
  index: true
  values: [active, inactive, prospect]
```

**ref** — requires a `target` type. Creates a traversable relationship edge in the index:
```yaml
client:
  type: ref
  index: true
  target: client
```

**list** — requires `itemType`. For list-of-ref, add `target`:
```yaml
tags:
  type: list
  index: false
  itemType: string

assigned_to:
  type: list
  index: true
  itemType: ref
  target: user
```

**amount** — stores as "value currency" string, indexes the numeric portion:
```yaml
settlement:
  type: amount
  index: true
```
Frontmatter value: `settlement: "1250000 USD"`

## Required Fields

Every schema must require `doc_id`. Add other fields that every record must have:

```yaml
required:
  - doc_id
  - title
  - status
```

The engine rejects `maad.create` calls that omit required fields.

## Indexing Strategy

`index: true` stores the field in the field_index table for fast queries via `maad.query`, `maad.aggregate`, and `maad.join`.

**Index these:**
- Fields you'll filter on (status, type, category)
- Fields you'll aggregate on (year, amount, date)
- Ref fields (always — enables relationship traversal)
- Fields you'll sort or range-query (dates, numbers)

**Don't index these:**
- Long text (descriptions, abstracts, notes)
- Fields only read in context (phone, address, body content)
- Low-cardinality fields you won't filter on

When unsure, don't index. You can add `index: true` later and reindex. Removing an index is also safe — just reindex.

## Template Headings (optional)

Define heading structure that `maad.create` generates for new records:

```yaml
template:
  - level: 1
    text: "{{title}}"
  - level: 2
    text: Background
  - level: 2
    text: Notes
```

Templates give records consistent structure. Useful for living database types where agents write body content. Less useful for static catalogs where the body comes from the source file.

## Source Tracking Fields

For types that come from imported files (static catalogs, analysis projects), add:

```yaml
source_file:
  type: string
  index: false
source_hash:
  type: string
  index: true
```

- `source_file` — original filename for provenance
- `source_hash` — content hash for duplicate detection during import

The import workflow uses `source_hash` to skip files that have already been processed.

## Schema Versioning

Schema refs use `<type>.v<number>` format. When changing a schema:
1. Create a new version file (`_schema/client.v2.yaml`)
2. Update the registry to reference the new version
3. Call `maad.reload`

Existing records retain their `schema:` frontmatter value. The engine validates against the schema version declared in each record.

## After Creating Schemas

1. Call `maad.reload` to pick up new registry and schemas
2. Call `maad.summary` or `maad.schema <type>` to verify
3. Optionally create a sample record to test validation
