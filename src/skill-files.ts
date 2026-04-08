// ============================================================================
// Skill Files — detailed workflow guides generated on init
// Loaded by the LLM when performing specific tasks.
// ============================================================================

export function generateSchemaGuide(): string {
  return `# Schema Guide

## Overview

Every MAAD record type needs two things:
1. A type entry in \`_registry/object_types.yaml\`
2. A schema file in \`_schema/<type>.v<version>.yaml\`

## Registry entry

\`\`\`yaml
types:
  client:
    path: clients/          # directory for this type's records
    id_prefix: cli           # prefix for auto-generated IDs
    schema: client.v1        # schema file reference
\`\`\`

## Schema file

\`\`\`yaml
# _schema/client.v1.yaml
type: client
required:
  - doc_id
  - name
  - status
fields:
  name:
    type: string
    index: true
  status:
    type: enum
    index: true
    values: [active, inactive, prospect]
  industry:
    type: string
    index: true
  primary_contact:
    type: ref
    index: true
    target: contact
  email:
    type: string
    index: true
  phone:
    type: string
    index: false
  since:
    type: date
    index: true
  tags:
    type: list
    index: false
    itemType: string
\`\`\`

## Field types

| Type | Description | Index behavior |
|------|-------------|---------------|
| \`string\` | Plain text | Exact match, contains |
| \`number\` | Numeric value | Range queries (gt, lt, gte, lte) |
| \`date\` | ISO date (YYYY-MM-DD) | Lexicographic range |
| \`enum\` | Constrained values | Exact match. Requires \`values\` list. |
| \`ref\` | Reference to another record | Exact match. Requires \`target\` type. Creates relationship edges. |
| \`boolean\` | true/false | Exact match |
| \`list\` | Array of values | Requires \`itemType\`. Use \`target\` for list-of-ref. |
| \`amount\` | Currency value (e.g. "1250000 USD") | Numeric range on extracted value |

## Required fields

Every schema must require \`doc_id\`. Add other required fields that every record of this type must have.

## Index flag

\`index: true\` means the field is stored in the field_index table for fast queries. Only index fields you need to filter or search on.

## Ref fields

\`type: ref\` creates a relationship edge between documents. The \`target\` must be a registered type. Example:

\`\`\`yaml
client:
  type: ref
  index: true
  target: client    # points to records of type "client"
\`\`\`

## Template headings (optional)

Add heading structure that \`maad.create\` will generate for new records:

\`\`\`yaml
template:
  - level: 1
    text: "{{title}}"
  - level: 2
    text: Background
  - level: 2
    text: Notes
\`\`\`

## Schema versioning

Schema refs use \`<type>.v<number>\` format. When changing a schema, create a new version file and update the registry reference.

## After creating schemas

1. Call \`maad.reload\` to pick up new registry and schemas
2. Call \`maad.summary\` or \`maad.schema <type>\` to verify
`;
}

export function generateImportGuide(): string {
  return `# Import Guide

## Overview

Importing raw data into MAAD:
1. Analyze the source data
2. Design the type registry and schemas
3. Create individual record files with frontmatter
4. Reindex to build the search index

## Step 1 — Analyze source data

Read the raw files. Identify:
- What types of records exist (clients, cases, contacts, notes, etc.)
- What fields each type has
- What relationships exist between types (client → contact, case → client)
- What field types to use (string, date, enum, ref, amount)

Use \`maad.scan\` on the source directory for structural patterns if helpful.

## Step 2 — Design registry and schemas

Create \`_registry/object_types.yaml\`:

\`\`\`yaml
types:
  client:
    path: clients/
    id_prefix: cli
    schema: client.v1
  case:
    path: cases/
    id_prefix: cas
    schema: case.v1
\`\`\`

Create schema files in \`_schema/\` for each type. See schema-guide.md for field type reference.

After writing registry and schemas, call \`maad.reload\` to pick them up.

## Step 3 — Create records

For each record in the source data, use \`maad.create\`:

\`\`\`
maad.create({
  docType: "client",
  fields: {
    name: "Apex Industrial Supply Co.",
    status: "active",
    industry: "Manufacturing",
    primary_contact: "con-ron-stafford",
    email: "r.stafford@apexind.com"
  }
})
\`\`\`

The engine will:
- Generate a doc_id (or use a custom one via the docId field)
- Validate against the schema
- Create the markdown file with frontmatter
- Index it
- Git auto-commit

## Handling tabular data

If source data is in markdown tables (rows = records):
- Each table row becomes one \`maad.create\` call
- Column headers map to frontmatter field names
- The table heading suggests the type name

## Handling narrative documents

If source data is unstructured text (articles, reports, filings):
- Create one record per document
- Put key facts in frontmatter fields (who, what, when, where)
- The body stays as-is — the original text is preserved unchanged
- Frontmatter IS the annotation layer — the LLM's understanding of the document

## Step 4 — Reindex and verify

After creating all records:

1. \`maad.reindex({ force: true })\` — rebuild the full index
2. \`maad.summary\` — verify counts and types
3. \`maad.query\` — spot-check a few records
4. \`maad.search\` — verify extracted objects

## Tips

- Call \`maad.schema <type>\` before creating records to verify field names
- Use \`maad.reload\` after any registry or schema changes
- Don't edit markdown files directly — use \`maad.create\` and \`maad.update\`
- If a create fails validation, check the error message — it tells you which field is wrong
`;
}
