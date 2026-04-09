# Import Guide

## Overview

This guide covers bringing data into a MAAD project. There are two scenarios:

1. **Initial build** — populating a new project with records (manual or from structured data)
2. **Ongoing import** — processing raw files dropped into `_inbox/` on a recurring basis

Both use the same MCP tools. The difference is workflow and automation.

## Before You Import

1. The schema must exist. Run `maad.schema <type>` to verify the type is registered and you understand the fields.
2. Know whether you're creating master records (one file each) or transaction records (appending to parent files).
3. If importing from files, check `_inbox/` for source material.

## Initial Build

For populating a new project after the Architect has designed the schema.

### Step 1 — Prepare the data

Identify what you're importing and map it to the schema:
- What type does each record belong to?
- What fields map to what source data?
- Are there relationships between records? (Import parents first, then dependents.)

### Step 2 — Create records

**Single records:**
```
maad.create({
  docType: "paper",
  fields: {
    title: "Attention Is All You Need",
    authors: ["Vaswani", "Shazeer", "Parmar"],
    year: 2017,
    journal: "NeurIPS",
    keywords: ["transformers", "attention", "neural networks"]
  }
})
```

**Bulk import (10+ records):**
```
maad.bulk_create({
  records: [
    { docType: "paper", fields: { title: "Paper A", year: 2020 } },
    { docType: "paper", fields: { title: "Paper B", year: 2021 } },
    ...
  ]
})
```

Bulk create is significantly faster — one git commit for all records, per-record success/failure reporting.

**Import order matters:** Create parent types first, then types that reference them. Clients before cases. Cases before case notes. The engine validates ref targets on create.

**Execute writes sequentially.** Never parallelize individual create or update calls. Use `bulk_create` for batch operations.

### Step 3 — Transaction records (append pattern)

For types that accumulate under a parent (notes, logs, entries):

First create the parent file:
```
maad.create({
  docType: "case_note",
  docId: "notes-cas-001",
  fields: { case: "cas-001" },
  body: "## 2024-03-05 — Initial Consultation {#note-001}\n\nClient described the situation..."
})
```

Then append subsequent entries:
```
maad.update({
  docId: "notes-cas-001",
  appendBody: "## 2024-03-12 — Follow-up Call {#note-002}\n\nDiscussed timeline and fees."
})
```

Each headed block becomes an indexed block retrievable via `maad.get warm`.

### Step 4 — Verify

After all records are created:

1. `maad.reindex({ force: true })` — rebuild the full index
2. `maad.summary` — verify type counts
3. `maad.query` — spot-check records by type
4. `maad.aggregate` — verify counts and distributions
5. `maad.search` — verify extracted objects are indexed

## Ongoing Import (Inbox Workflow)

For projects that receive new files on a recurring basis — research papers, receipts, reports, any raw data that needs to be processed into MAAD records.

### How it works

```
_inbox/                     ← raw files land here
  new-paper.md
  receipt-march-15.pdf
  
data/                       ← processed MAAD records live here
  papers/
    pap-001.md
    pap-002.md
```

1. Raw files are placed in `_inbox/` (by the user, another agent, or an automated process)
2. The agent scans `_inbox/` for new files
3. For each file: read content, extract metadata, create a MAAD record via `maad.create` or `maad.bulk_create`
4. Delete the source file from `_inbox/` after successful creation
5. The MAAD record in `data/` is now the canonical copy

### Import process

**Step 1 — Scan for new files:**

Check `_inbox/` for unprocessed files. List what's there and identify the target type for each file.

**Step 2 — Check for duplicates:**

Before creating a record, check if it already exists:
```
maad.query({
  docType: "paper",
  filter: { source_hash: "<hash-of-source-file>" }
})
```

If a record with the same `source_hash` exists, skip it. This prevents duplicate imports on repeated runs.

**Step 3 — Extract metadata:**

Read the source file and extract structured fields for the frontmatter. What you extract depends on the type:

| Source | What to extract |
|--------|----------------|
| Research paper | Title, authors, year, journal, abstract, keywords |
| Receipt/expense | Vendor, amount, date, category, payment method |
| Report/document | Title, author, date, subject, summary |
| Book/chapter | Title, author, publication year, genre, synopsis |

Use your domain knowledge to identify the right fields. The schema defines what's expected — run `maad.schema <type>` to check.

**Step 4 — Create the record:**

```
maad.create({
  docType: "paper",
  fields: {
    title: "Extracted Title",
    authors: ["Author A", "Author B"],
    year: 2024,
    source_file: "original-filename.md",
    source_hash: "sha256-of-original-content"
  },
  body: "<full content of the source file>"
})
```

The body preserves the original content. The frontmatter adds the structured, queryable layer on top.

**Step 5 — Clean up:**

After successful creation, delete the source file from `_inbox/`. The MAAD record now contains everything — the structured metadata in frontmatter and the full content in the body. Keeping the source is redundant.

**Step 6 — Verify:**

After processing all files:
```
maad.reindex({ force: true })
maad.summary
```

Confirm the new records appear in the correct types with expected counts.

### Source tracking fields

Every imported type should include these fields in its schema:

```yaml
source_file:
  type: string
  index: false
source_hash:
  type: string
  index: true
```

- `source_file` records where the data came from (provenance)
- `source_hash` enables duplicate detection across import runs

### Computing source_hash

Hash the file content before processing. Use any consistent algorithm (SHA-256 recommended). The hash is stored in frontmatter and indexed for fast lookup during dedup checks.

## Handling Different Source Formats

### Markdown files

Simplest case. Read the file, extract metadata for frontmatter, preserve the body as-is.

### Tabular data (CSV, markdown tables)

Each row becomes a record:
- Column headers map to frontmatter field names
- Classify: is each row a master record or a transaction entry?
- Master rows: each row becomes one `maad.create` call (or use `maad.bulk_create` for the batch)
- Transaction rows: group by parent, create one file per parent, append rows as headed blocks

### Narrative documents (articles, reports, filings)

One record per document:
- Extract key facts for frontmatter (who, what, when, where)
- The body stays as-is — the original text is preserved unchanged
- Frontmatter IS the structured annotation layer — the agent's understanding of the document

### Structured data (JSON, API responses)

Map JSON fields to schema fields:
- Flatten nested objects into frontmatter fields
- Preserve the full JSON as body content if the structure is valuable for reading
- Or convert to markdown narrative if the JSON is purely structural

## Tips

- Always call `maad.schema <type>` before creating records to verify field names and types
- Use `maad.reload` after any registry or schema changes
- Execute write operations sequentially — never parallelize individual creates
- Use `maad.bulk_create` for batches of 10+ records
- Work through one type at a time: all parents first, then dependent types
- If a create fails validation, the error message tells you which field is wrong
- For large imports, verify counts with `maad.aggregate` after each type
