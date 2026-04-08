// ============================================================================
// CLAUDE.md Generator — Agent instructions for MCP-first MAAD workflow
// Generated on init. Tells the LLM how to work with this project.
// ============================================================================

export function generateClaudeMd(): string {
  return `# MAAD Project — Agent Instructions

## How to work with this project

This is a MAAD project. You have MCP tools for all data operations.

**Use MAAD MCP tools for everything.** Do not use bash, shell commands, or direct file reads for data access. If a tool fails, report the error — do not fall back to shell.

## Boot sequence

1. Run \`maad.summary\` to see what's in this project
2. Use \`maad.schema <type>\` to understand record structure before writing
3. Use \`maad.health\` if something seems wrong

## Reading data

- \`maad.summary\` — project snapshot (start here)
- \`maad.get\` — read a record (hot/warm/cold/full)
- \`maad.query\` — find records by type and filters
- \`maad.search\` — find extracted objects across all records
- \`maad.related\` — traverse relationships between records

## Writing data

- **Always** call \`maad.schema <type>\` before creating or updating records
- \`maad.create\` — new record (engine validates against schema)
- \`maad.update\` — modify fields or body (use expectedVersion for safe writes)

## Importing raw data

When onboarding new data into this project:

1. Read the raw files to understand the data
2. Design the registry (\`_registry/object_types.yaml\`) and schemas (\`_schema/*.yaml\`)
3. Call \`maad.reload\` to pick up the new registry and schemas
4. Create individual records using \`maad.create\` for each record
5. Every record needs frontmatter: \`doc_id\`, \`doc_type\`, \`schema\`, plus fields matching the schema
6. Call \`maad.reindex\` after bulk creation
7. Call \`maad.summary\` to confirm

## Frontmatter format

Every markdown record must have a YAML frontmatter header:

\`\`\`yaml
---
doc_id: <unique-id>
doc_type: <registered-type>
schema: <type.version>
field1: value1
field2: value2
---
\`\`\`

- \`doc_id\`: unique identifier (auto-generated if omitted in create)
- \`doc_type\`: must match a type in \`_registry/object_types.yaml\`
- \`schema\`: must match a schema file in \`_schema/\`
- Additional fields must match the schema definition

## Schema format

Schema files in \`_schema/\` define field types:

\`\`\`yaml
type: <type_name>
required:
  - doc_id
  - <field>
fields:
  <field_name>:
    type: string | number | date | enum | ref | boolean | list | amount
    index: true | false
    values: [val1, val2]  # for enums
    target: <type>        # for refs
\`\`\`

Call \`maad.schema <type>\` to see the resolved field definitions.

## Server management

- \`maad.reload\` — reload registry and schemas after config changes (no restart needed)
- \`maad.health\` — check engine status
- \`maad.reindex\` — rebuild index after bulk file changes

## Rules

1. MCP tools only — no bash for data operations
2. Schema first — call \`maad.schema\` before writes
3. Reload after config changes — call \`maad.reload\` after editing registry or schemas
4. Report errors — if a tool returns \`ok: false\`, tell the user what happened
`;
}
