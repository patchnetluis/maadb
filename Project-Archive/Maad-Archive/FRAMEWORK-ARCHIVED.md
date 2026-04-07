# MAAD Framework — Implementation Spec

> The complete technical reference for building the MAAD engine.
> Every type, interface, module, parse rule, and database schema needed for implementation.

This document is the implementation guide. [README-MVP.md](README-MVP.md) is the product spec. [MAAD-TOOLS.md](MAAD-TOOLS.md) is the LLM-facing tool interface. This document tells you how to build the engine that powers both.

---

## Table of Contents

1. [Module Map](#module-map)
2. [Core Types](#core-types)
3. [MAAD YAML Profile](#maad-yaml-profile)
4. [Registry Module](#registry-module)
5. [Schema Module](#schema-module)
6. [Parser Module](#parser-module)
7. [Extractor Module](#extractor-module)
8. [Backend Module](#backend-module)
9. [Git Module](#git-module)
10. [Engine Pipeline](#engine-pipeline)
11. [Document Writer](#document-writer)
12. [MCP Server](#mcp-server)
13. [CLI](#cli)
14. [Error Handling](#error-handling)
15. [Testing Strategy](#testing-strategy)
16. [Dependencies](#dependencies)
17. [Project Configuration](#project-configuration)

---

## Module Map

```
src/
  types.ts                  # All shared types, branded IDs, discriminated unions
  errors.ts                 # Error types and Result<T, E> pattern

  registry/
    loader.ts               # Read and validate _registry/object_types.yaml
    types.ts                # RegistryType, Registry

  schema/
    loader.ts               # Read and validate _schema/*.yaml files
    validator.ts            # Validate a document's frontmatter against its schema
    types.ts                # SchemaDefinition, FieldDefinition, FieldType

  parser/
    frontmatter.ts          # Extract YAML frontmatter via gray-matter
    blocks.ts               # Split markdown body into heading-delimited blocks
    tags.ts                 # Extract {{field}} value calls
    annotations.ts          # Extract [[type:value|label]] inline annotations
    index.ts                # Public API: parseDocument(filePath) -> ParsedDocument

  extractor/
    fields.ts               # Extract indexed fields from parsed frontmatter
    objects.ts              # Extract objects from inline annotations
    normalizers.ts          # Normalize dates, amounts, quantities
    relationships.ts        # Build relationship edges from refs and mentions
    index.ts                # Public API: extractObjects(parsed, schema) -> ExtractionResult

  backend/
    adapter.ts              # MaadBackend interface
    sqlite/
      connection.ts         # SQLite connection and WAL mode setup
      schema.ts             # CREATE TABLE statements, migrations
      queries.ts            # Prepared statement wrappers
      index.ts              # Public API: SqliteBackend implements MaadBackend

  git/
    commit.ts               # Auto-commit with structured messages
    log.ts                  # Parse git log into structured history
    diff.ts                 # Parse git diff into frontmatter + body changes
    snapshot.ts             # git show at commit or date
    index.ts                # Public API: GitLayer

  writer/
    template.ts             # Generate markdown from schema + fields + body
    serializer.ts           # Serialize frontmatter to YAML, reassemble file
    index.ts                # Public API: writeDocument(...)

  tools/
    discovery.ts            # describe, schema, inspect
    crud.ts                 # create, get, find, update, delete
    navigation.ts           # list_related, search_objects
    audit.ts                # history, diff, snapshot, audit
    maintenance.ts          # validate, reindex
    index.ts                # Register all tools with MCP server

  engine.ts                 # Orchestrates the 6-stage pipeline
  server.ts                 # MCP server entry point
  cli.ts                    # CLI entry point
```

---

## Core Types

All types live in `src/types.ts`. The engine uses discriminated unions for AST nodes and branded types for identifiers.

### Branded Identifiers

Prevent mixing raw strings with typed IDs. Zero runtime cost.

```ts
type Brand<T, B extends string> = T & { readonly __brand: B };

type DocId       = Brand<string, 'DocId'>;        // e.g. "cli-acme"
type DocType     = Brand<string, 'DocType'>;       // e.g. "client"
type SchemaRef   = Brand<string, 'SchemaRef'>;     // e.g. "client.v1"
type FilePath    = Brand<string, 'FilePath'>;       // e.g. "clients/cli-acme.md"
type BlockId     = Brand<string, 'BlockId'>;        // e.g. "timeline"
type CommitSha   = Brand<string, 'CommitSha'>;      // e.g. "a1b2c3d"

// Constructor helpers (runtime validation + branding)
function docId(raw: string): DocId;
function docType(raw: string): DocType;
function filePath(raw: string): FilePath;
```

### Result Type

The engine accumulates errors instead of throwing. Every stage returns `Result<T, MaadError[]>`.

```ts
type Result<T, E = MaadError[]> =
  | { ok: true; value: T }
  | { ok: false; errors: E };

function ok<T>(value: T): Result<T>;
function err<T>(errors: MaadError[]): Result<T>;
```

### Source Location

Carried through every IR for error reporting and pointer creation.

```ts
interface SourceLocation {
  file: FilePath;
  line: number;
  col: number;
}
```

### Extraction Primitives

11 primitives, each with distinct normalization behavior. Derived from NER standard types, extended with database/systems concepts. The default subtype map is built in; projects can extend it via the registry.

```ts
const PRIMITIVES = [
  'entity',       // person, org, team, product, event, role — preserve string
  'date',         // -> ISO 8601 date/datetime
  'duration',     // -> ISO 8601 duration (PT3H, P2W)
  'amount',       // -> number + currency code
  'measure',      // -> number + unit
  'quantity',     // -> number (bare count)
  'percentage',   // -> decimal (0.15)
  'location',     // preserve string — address, place, coordinates
  'identifier',   // preserve string, flag as lookup key
  'contact',      // sub-normalize: email (lowercase), phone (E.164), URL (normalize)
  'media',        // path resolution + media type detection
] as const;
type Primitive = typeof PRIMITIVES[number];

// Default subtype -> primitive normalization map
// Projects can extend this via _registry/object_types.yaml extraction.subtypes
// Unknown subtypes default to 'entity'
const DEFAULT_SUBTYPE_MAP: Record<string, Primitive> = {
  // entity subtypes
  person:         'entity',
  org:            'entity',
  team:           'entity',
  product:        'entity',
  event:          'entity',
  role:           'entity',

  // date subtypes
  datetime:       'date',

  // duration subtypes
  timespan:       'duration',

  // amount subtypes
  currency:       'amount',
  price:          'amount',

  // measure subtypes
  weight:         'measure',
  height:         'measure',
  distance:       'measure',
  temperature:    'measure',
  dosage:         'measure',
  area:           'measure',

  // quantity subtypes
  count:          'quantity',

  // percentage subtypes
  rate:           'percentage',
  ratio:          'percentage',

  // location subtypes
  address:        'location',
  place:          'location',
  coordinates:    'location',

  // identifier subtypes
  case_number:    'identifier',
  invoice:        'identifier',
  license:        'identifier',
  reference:      'identifier',
  code:           'identifier',

  // contact subtypes
  email:          'contact',
  phone:          'contact',
  url:            'contact',

  // media subtypes
  image:          'media',
  video:          'media',
  audio:          'media',
  document:       'media',
  diagram:        'media',
};

function buildSubtypeMap(
  defaults: Record<string, Primitive>,
  projectExtensions?: Record<string, string>
): Record<string, Primitive> {
  const map = { ...defaults };
  if (projectExtensions) {
    for (const [subtype, primitive] of Object.entries(projectExtensions)) {
      if (PRIMITIVES.includes(primitive as Primitive)) {
        map[subtype] = primitive as Primitive;
      }
    }
  }
  return map;
}

function resolvePrimitive(subtype: string, map: Record<string, Primitive>): Primitive {
  return map[subtype] ?? 'entity';
}
```

### Document IR (Intermediate Representations)

Each pipeline stage produces a distinct IR. Downstream stages consume the upstream IR.

```ts
// Stage 3 output: raw parsed document
interface ParsedDocument {
  filePath: FilePath;
  fileHash: string;
  frontmatter: Record<string, unknown>;   // raw YAML key-values
  blocks: ParsedBlock[];
  valueCalls: ValueCall[];                 // {{field}} references
  annotations: InlineAnnotation[];         // [[type:value|label]] tags
}

interface ParsedBlock {
  id: BlockId | null;                      // from {#id} or slugified heading
  heading: string;
  level: number;                           // 1-6
  startLine: number;
  endLine: number;
  content: string;                         // raw markdown of the block
}

interface ValueCall {
  field: string;                           // the key inside {{...}}
  location: SourceLocation;
}

interface InlineAnnotation {
  rawType: string;                         // "person", "date", "team", etc.
  primitive: Primitive;                    // resolved via SUBTYPE_MAP
  value: string;                           // "Officer Davis", "2026-03-28"
  label: string;                           // display text
  location: SourceLocation;
}

// Stage 4 output: schema-bound document
interface BoundDocument {
  parsed: ParsedDocument;
  docId: DocId;
  docType: DocType;
  schemaRef: SchemaRef;
  validatedFields: Record<string, ValidatedField>;
  validationResult: ValidationResult;
}

interface ValidatedField {
  name: string;
  value: unknown;
  fieldType: FieldType;
  role: string | null;
  indexed: boolean;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

interface ValidationError {
  field: string;
  message: string;
  location: SourceLocation | null;
}

// Stage 5 output: extracted objects
interface ExtractionResult {
  document: BoundDocument;
  objects: ExtractedObject[];
  relationships: Relationship[];
}

interface ExtractedObject {
  primitive: Primitive;
  subtype: string;
  value: string;
  normalizedValue: string | number | null; // normalized form (ISO date, number, etc.)
  label: string;
  role: string | null;
  docId: DocId;
  location: SourceLocation;
  blockId: BlockId | null;
}

interface Relationship {
  sourceDocId: DocId;
  targetDocId: DocId;
  field: string;                           // the ref field that created this edge
  relationType: 'ref' | 'mention';         // frontmatter ref vs inline mention
}
```

---

## MAAD YAML Profile

MAAD uses a constrained subset of YAML based on the YAML 1.2 JSON Schema. This gives deterministic type resolution without the ambiguity of the YAML Core Schema.

### Base: YAML 1.2 JSON Schema

The JSON Schema subset resolves types deterministically:

| YAML value | Resolved type |
|------------|---------------|
| `null`, `Null`, `NULL`, `~` | null |
| `true`, `false` | boolean |
| Integer patterns (`42`, `-1`, `0`) | number (integer) |
| Float patterns (`3.14`, `-0.5`, `.inf`, `.nan`) | number (float) |
| Everything else | string |

No `yes`/`no`/`on`/`off` as booleans. No octal/hex. These Core Schema features are explicitly excluded.

### Allowed Constructs

| Construct | YAML syntax | MAAD usage |
|-----------|-------------|------------|
| Mapping | `key: value` | Frontmatter fields, schema definitions, registry entries |
| Sequence | `- item` or `[a, b, c]` | Lists (tags, participants, enum values) |
| String scalar | `plain`, `"quoted"`, `'single'` | Field values |
| Number scalar | `42`, `3.14` | Numeric fields |
| Boolean scalar | `true`, `false` | Boolean fields |
| Null | `null`, `~` | Optional field absence |
| Shallow nesting | `key: { a: 1, b: 2 }` | Max depth 2 in frontmatter |

### Prohibited Constructs

| Construct | Why prohibited |
|-----------|---------------|
| Anchors and aliases (`&`, `*`) | Creates graph structures, complicates parsing |
| Custom tags (`!tag`) | MAAD controls the type system, not YAML |
| Multi-document (`---` separator mid-stream) | One document per file |
| Complex keys (mapping/sequence as key) | Keys must be plain string scalars |
| Merge key (`<<`) | YAML 1.1 holdover, not part of 1.2 |
| Deep nesting (depth > 2) | Frontmatter should be flat or shallow |
| Block scalars (`|`, `>`) in frontmatter | Use plain strings or quoted strings |

### Validation Rules

The YAML profile validator runs after `gray-matter` parses the frontmatter and before schema binding.

```ts
interface YamlProfileValidator {
  validate(frontmatter: Record<string, unknown>): Result<Record<string, unknown>>;
}
```

Checks:
1. All keys are plain string scalars
2. No values exceed depth 2
3. All values are: string, number, boolean, null, array of scalars, or shallow map
4. No anchor/alias artifacts (gray-matter resolves these — detect and reject)
5. Reserved keys (`doc_id`, `doc_type`, `schema`) are present and correctly typed

---

## Registry Module

### File: `_registry/object_types.yaml`

```yaml
types:
  <type_name>:
    path: <directory>/       # where markdown files for this type live
    id_prefix: <prefix>      # short prefix for doc_id generation
    schema: <type>.v<n>      # reference to schema file
    template: <file>         # optional: markdown template for deterministic authoring

extraction:                  # optional: extend the default subtype map
  subtypes:
    <subtype>: <primitive>   # e.g. vehicle: entity, dosage: measure
```

### Types

```ts
interface RegistryType {
  name: DocType;
  path: string;              // directory path relative to project root
  idPrefix: string;          // e.g. "cli", "cas"
  schemaRef: SchemaRef;      // e.g. "client.v1"
  template: string | null;   // optional template file path
}

interface ExtractionConfig {
  subtypes: Record<string, Primitive>;   // project-specific subtype extensions
}

interface Registry {
  types: Map<DocType, RegistryType>;
  extraction: ExtractionConfig;          // merged with DEFAULT_SUBTYPE_MAP at load time
  subtypeMap: Record<string, Primitive>; // the fully merged map
}
```

### Loader Behavior

```ts
interface RegistryLoader {
  load(projectRoot: FilePath): Result<Registry>;
}
```

1. Read `_registry/object_types.yaml`
2. Parse with YAML profile validation
3. For each type entry:
   - Validate `name` is a valid identifier (lowercase, alphanumeric, underscores)
   - Validate `path` directory exists
   - Validate `id_prefix` is 2-5 lowercase alphanumeric characters
   - Validate `schema` reference points to an existing file in `_schema/`
   - Validate `template` file exists if specified
4. Check for duplicate `id_prefix` values across types
5. Return `Registry` or accumulated errors

### ID Generation

When `maad.create` is called without a `doc_id`, the engine generates one:

```ts
function generateDocId(type: RegistryType, fields: Record<string, unknown>): DocId {
  // Strategy: <prefix>-<slugified-name-or-title> or <prefix>-<timestamp>
  // If the schema has a 'name' or 'title' field, slugify it
  // Otherwise, use ISO date fragment: <prefix>-YYYY-MM-DD-NNN
  // Collision check against backend before returning
}
```

---

## Schema Module

### File: `_schema/<type>.v<n>.yaml`

```yaml
type: <type_name>
version: <n>
required:
  - doc_id
  - <field>
fields:
  <field_name>:
    type: string | number | date | enum | ref | boolean | list | amount
    index: true | false
    role: <optional string>
    format: <optional string>
    target: <optional type_name>
    values: <optional string[]>
    default: <optional value>
    item_type: <optional string>     # for list fields: type of list items
template:
  headings:                          # optional: deterministic authoring structure
    - level: 1
      text: "{{title}}"
    - level: 2
      text: "Details"
      id: "details"
    - level: 2
      text: "Notes"
      id: "notes"
```

### Types

```ts
type FieldType = 'string' | 'number' | 'date' | 'enum' | 'ref' | 'boolean' | 'list' | 'amount';

interface FieldDefinition {
  name: string;
  type: FieldType;
  index: boolean;
  role: string | null;
  format: string | null;          // e.g. "YYYY-MM-DD" for dates
  target: DocType | null;         // for ref fields: the target registry type
  values: string[] | null;        // for enum fields: allowed values
  defaultValue: unknown;
  itemType: FieldType | null;     // for list fields
}

interface TemplateHeading {
  level: number;
  text: string;                    // can contain {{field}} references
  id: string | null;               // the {#id} anchor
}

interface SchemaDefinition {
  type: DocType;
  version: number;
  required: string[];
  fields: Map<string, FieldDefinition>;
  template: TemplateHeading[] | null;
}

interface SchemaStore {
  schemas: Map<SchemaRef, SchemaDefinition>;
  getSchema(ref: SchemaRef): SchemaDefinition | null;
  getSchemaForType(type: DocType): SchemaDefinition | null;
}
```

### Schema Loader

```ts
interface SchemaLoader {
  loadAll(projectRoot: FilePath, registry: Registry): Result<SchemaStore>;
}
```

1. For each type in registry, resolve the schema file path: `_schema/<schema_ref>.yaml`
   - `schema: client.v1` resolves to `_schema/client.v1.yaml`
2. Parse YAML with profile validation
3. Build `FieldDefinition` for each field entry
4. Validate:
   - All `required` fields exist in `fields` map
   - `ref` fields have a valid `target` that exists in the registry
   - `enum` fields have non-empty `values` array
   - `date` fields have a `format` (default to `YYYY-MM-DD` if missing)
   - `list` fields have an `item_type`
   - `amount` fields store value + currency code
5. Return `SchemaStore` or accumulated errors

### Schema Validator

Validates a document's frontmatter against its bound schema.

```ts
interface SchemaValidator {
  validate(
    frontmatter: Record<string, unknown>,
    schema: SchemaDefinition,
    registry: Registry
  ): ValidationResult;
}
```

Validation checks per field:

| Field type | Validation |
|------------|------------|
| `string` | `typeof value === 'string'` |
| `number` | `typeof value === 'number'` and finite |
| `date` | String matching the schema's `format` regex |
| `enum` | Value is in `values` array |
| `ref` | String starts with the target type's `id_prefix` + `-`, and document exists in backend |
| `boolean` | `typeof value === 'boolean'` |
| `list` | `Array.isArray(value)`, each item matches `item_type` |
| `amount` | String matching `<number> <currency_code>` pattern (e.g. `100.00 USD`) |

Ref existence checking is a soft validation — on initial index the targets may not be indexed yet. Use two passes: structural validation first, ref resolution second.

---

## Parser Module

The parser converts a raw markdown file into a `ParsedDocument`. It runs as a pipeline of sub-parsers.

### Parse Order

Critical: respect verbatim contexts. Never parse custom syntax inside code blocks or code spans.

```
1. Read raw file bytes, compute SHA-256 hash
2. Extract frontmatter (gray-matter) — strips YAML, returns body
3. Identify verbatim zones (fenced code blocks, indented code, inline code spans)
4. Split body into blocks (heading-delimited sections)
5. Within non-verbatim zones: extract {{field}} value calls
6. Within non-verbatim zones: extract [[type:value|label]] annotations
7. Assemble ParsedDocument
```

### Frontmatter Parser (`frontmatter.ts`)

Uses `gray-matter` to split the file.

```ts
interface FrontmatterResult {
  frontmatter: Record<string, unknown>;
  body: string;
  bodyStartLine: number;           // line number where body begins (after closing ---)
}

function parseFrontmatter(raw: string): Result<FrontmatterResult>;
```

Rules:
- File must start with `---` on line 1
- Closing `---` must exist
- Content between is YAML
- If no frontmatter is found, return empty object and full content as body

### Block Parser (`blocks.ts`)

Splits the markdown body into heading-delimited sections.

```ts
function parseBlocks(body: string, bodyStartLine: number): ParsedBlock[];
```

Rules:
- ATX headings only (`# ` through `###### `). Setext headings are not used for block splitting.
- A block starts at a heading line and extends to the line before the next heading of equal or higher level, or end of file.
- Block ID assignment:
  1. If heading contains `{#custom_id}`, use that and strip from heading text
  2. Otherwise, slugify the heading text: lowercase, replace spaces with `-`, strip non-alphanumeric except `-`
- Content before the first heading is the "preamble" block with `id: null` and `heading: ""`
- Lines inside fenced code blocks (` ``` `) do not count as headings even if they start with `#`

### Verbatim Zone Detection

Before extracting `{{}}` or `[[]]`, mark zones where custom syntax should not be parsed:

```ts
interface VerbatimZone {
  startLine: number;
  endLine: number;
}

function findVerbatimZones(body: string): VerbatimZone[];
```

Zones:
1. **Fenced code blocks**: ` ``` ` or `~~~` opening to matching closing fence
2. **Indented code blocks**: 4+ spaces or 1+ tab at start of line (consecutive)
3. **Inline code spans**: Single backtick `` ` `` to matching backtick (within a line)

### Value Call Extractor (`tags.ts`)

Extracts `{{field}}` references from non-verbatim markdown body.

```ts
const VALUE_CALL_REGEX = /\{\{([a-zA-Z_][a-zA-Z0-9_.]*)\}\}/g;

function extractValueCalls(
  body: string,
  bodyStartLine: number,
  verbatimZones: VerbatimZone[]
): ValueCall[];
```

Rules:
- Field name must be a valid identifier: starts with letter or `_`, followed by alphanumeric, `_`, or `.`
- Dot notation allowed for nested access: `{{client.name}}`
- Skip matches that fall within a verbatim zone
- Return field name and source location

### Annotation Extractor (`annotations.ts`)

Extracts `[[type:value|label]]` inline object annotations.

```ts
const ANNOTATION_REGEX = /\[\[([a-zA-Z_]+):([^|]+)\|([^\]]+)\]\]/g;

function extractAnnotations(
  body: string,
  bodyStartLine: number,
  verbatimZones: VerbatimZone[]
): InlineAnnotation[];
```

Rules:
- `type`: one or more letters/underscores (the subtype label)
- `value`: everything between `:` and `|` (trimmed)
- `label`: everything between `|` and `]]` (trimmed, this is the display text)
- Resolve `type` to a primitive via `SUBTYPE_MAP`, defaulting to `entity`
- Skip matches within verbatim zones
- Return the annotation with both `rawType` (original label) and `primitive` (resolved)

### Public API

```ts
// parser/index.ts
interface DocumentParser {
  parse(filePath: FilePath): Promise<Result<ParsedDocument>>;
}
```

Implementation composes all sub-parsers:

```ts
async function parse(filePath: FilePath): Promise<Result<ParsedDocument>> {
  const raw = await readFile(filePath, 'utf-8');
  const hash = sha256(raw);
  const fm = parseFrontmatter(raw);
  if (!fm.ok) return fm;

  const verbatimZones = findVerbatimZones(fm.value.body);
  const blocks = parseBlocks(fm.value.body, fm.value.bodyStartLine);
  const valueCalls = extractValueCalls(fm.value.body, fm.value.bodyStartLine, verbatimZones);
  const annotations = extractAnnotations(fm.value.body, fm.value.bodyStartLine, verbatimZones);

  return ok({
    filePath: filePath,
    fileHash: hash,
    frontmatter: fm.value.frontmatter,
    blocks,
    valueCalls,
    annotations,
  });
}
```

---

## Extractor Module

The extractor transforms a `BoundDocument` (schema-validated parsed document) into `ExtractedObject[]` and `Relationship[]`.

### Field Extractor (`fields.ts`)

Extracts indexed frontmatter fields as objects.

```ts
function extractFields(
  bound: BoundDocument,
  schema: SchemaDefinition
): ExtractedObject[];
```

For each field in `validatedFields` where `indexed: true`:
1. Create an `ExtractedObject` with:
   - `primitive`: mapped from field type (`date` -> `date`, `amount` -> `amount`, `ref` -> `entity`, `string`/`number`/`enum` -> varies)
   - `subtype`: the field name itself (e.g. `status`, `priority`)
   - `value`: the raw field value
   - `normalizedValue`: normalized form (see normalizers)
   - `role`: from field definition
   - `docId`: the document's doc_id
   - `location`: line 1 (frontmatter)

### Object Extractor (`objects.ts`)

Converts inline annotations to extracted objects.

```ts
function extractAnnotationObjects(
  bound: BoundDocument,
  annotations: InlineAnnotation[]
): ExtractedObject[];
```

For each annotation:
1. Normalize the value based on the resolved primitive (see normalizers)
2. Map to the block it falls within (by line number)
3. Create `ExtractedObject`

### Normalizers (`normalizers.ts`)

One normalizer per primitive. Each returns a typed result or null if unparseable.

```ts
// entity, location, identifier — preserve as string
function normalizeString(value: string): string;
// Trim whitespace, collapse internal whitespace

function normalizeDate(value: string): string | null;
// Parse flexible date formats -> ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)
// "March 28, 2026" -> "2026-03-28"
// "2-25-26" -> "2026-02-25"
// "2026-03-28" -> "2026-03-28" (passthrough)

function normalizeDuration(value: string): string | null;
// Parse to ISO 8601 duration
// "3 hours" -> "PT3H"
// "2 weeks" -> "P2W"
// "45 minutes" -> "PT45M"
// "1 hour 30 minutes" -> "PT1H30M"

function normalizeAmount(value: string): { amount: number; currency: string } | null;
// "100.00 USD" -> { amount: 100.00, currency: "USD" }
// "$100" -> { amount: 100.00, currency: "USD" }
// "€50" -> { amount: 50.00, currency: "EUR" }

function normalizeMeasure(value: string): { value: number; unit: string } | null;
// "500mg" -> { value: 500, unit: "mg" }
// "6 feet" -> { value: 6, unit: "feet" }
// "98.6°F" -> { value: 98.6, unit: "°F" }
// "1200 sqft" -> { value: 1200, unit: "sqft" }

function normalizeQuantity(value: string): number | null;
// "42" -> 42
// "3.5" -> 3.5

function normalizePercentage(value: string): number | null;
// "15%" -> 0.15
// "85 percent" -> 0.85
// "0.15" -> 0.15 (passthrough if already decimal)

function normalizeContact(value: string, subtype?: string): string;
// email: lowercase, trim -> "jane@acme.com"
// phone: normalize toward E.164 -> "+15550100" (best effort)
// url: normalize protocol, trailing slash -> "https://acme.com"
// If subtype unknown, auto-detect from value pattern

function normalizeMedia(value: string): { path: string; mediaType: string } | null;
// "evidence/photo-001.jpg" -> { path: "evidence/photo-001.jpg", mediaType: "image" }
// Detect mediaType from extension: .jpg/.png -> image, .mp4/.mov -> video,
// .mp3/.wav -> audio, .pdf/.docx -> document, .svg/.drawio -> diagram

// Dispatch function: routes to the correct normalizer based on primitive
function normalize(
  primitive: Primitive,
  value: string,
  subtype?: string
): { normalized: string | number | Record<string, unknown> | null } {
  switch (primitive) {
    case 'entity':      return { normalized: normalizeString(value) };
    case 'date':        return { normalized: normalizeDate(value) };
    case 'duration':    return { normalized: normalizeDuration(value) };
    case 'amount':      return { normalized: normalizeAmount(value) };
    case 'measure':     return { normalized: normalizeMeasure(value) };
    case 'quantity':    return { normalized: normalizeQuantity(value) };
    case 'percentage':  return { normalized: normalizePercentage(value) };
    case 'location':    return { normalized: normalizeString(value) };
    case 'identifier':  return { normalized: normalizeString(value) };
    case 'contact':     return { normalized: normalizeContact(value, subtype) };
    case 'media':       return { normalized: normalizeMedia(value) };
  }
}
```

### Relationship Builder (`relationships.ts`)

```ts
function extractRelationships(
  bound: BoundDocument,
  schema: SchemaDefinition,
  annotations: InlineAnnotation[]
): Relationship[];
```

Two sources of relationships:

1. **Ref fields** (frontmatter): For each field with `type: ref`, create a `Relationship` with `relationType: 'ref'`
2. **Inline mentions** (annotations): For each annotation whose value matches a known `doc_id` pattern (starts with a registered `id_prefix` + `-`), create a `Relationship` with `relationType: 'mention'`

### Public API

```ts
// extractor/index.ts
interface ObjectExtractor {
  extract(bound: BoundDocument, schema: SchemaDefinition): ExtractionResult;
}
```

---

## Backend Module

### Adapter Interface

```ts
// backend/adapter.ts
interface MaadBackend {
  // Lifecycle
  init(): Promise<void>;
  close(): Promise<void>;

  // Write operations (called during materialize stage)
  putDocument(doc: DocumentRecord): Promise<void>;
  putObjects(objects: ExtractedObject[]): Promise<void>;
  putRelationships(relations: Relationship[]): Promise<void>;
  putBlocks(docId: DocId, blocks: ParsedBlock[]): Promise<void>;

  // Read operations (called by MCP tools)
  getDocument(docId: DocId): Promise<DocumentRecord | null>;
  getDocumentByPath(path: FilePath): Promise<DocumentRecord | null>;
  findDocuments(query: DocumentQuery): Promise<DocumentMatch[]>;
  findObjects(query: ObjectQuery): Promise<ObjectMatch[]>;
  getRelationships(docId: DocId, direction: 'outgoing' | 'incoming' | 'both'): Promise<Relationship[]>;
  getBlocks(docId: DocId): Promise<ParsedBlock[]>;

  // Maintenance
  removeDocument(docId: DocId): Promise<void>;
  getFileHash(path: FilePath): Promise<string | null>;
  getAllFileHashes(): Promise<Map<FilePath, string>>;
  getStats(): Promise<BackendStats>;
}

interface DocumentRecord {
  docId: DocId;
  docType: DocType;
  schemaRef: SchemaRef;
  filePath: FilePath;
  fileHash: string;
  version: number;
  frontmatter: Record<string, unknown>;
  deleted: boolean;
  indexedAt: string;              // ISO timestamp
}

interface DocumentQuery {
  docType?: DocType;
  filters?: Record<string, FilterCondition>;
  includeFrontmatter?: boolean;
  limit?: number;
  offset?: number;
}

type FilterCondition =
  | { op: 'eq'; value: unknown }
  | { op: 'neq'; value: unknown }
  | { op: 'gt' | 'gte' | 'lt' | 'lte'; value: number | string }
  | { op: 'in'; value: unknown[] }
  | { op: 'contains'; value: string };

interface ObjectQuery {
  primitive?: Primitive;
  subtype?: string;
  value?: string;
  contains?: string;
  range?: { gte?: string; gt?: string; lte?: string; lt?: string };
  docId?: DocId;
  limit?: number;
  offset?: number;
}

interface DocumentMatch {
  docId: DocId;
  docType: DocType;
  filePath: FilePath;
  frontmatter?: Record<string, unknown>;
}

interface ObjectMatch {
  primitive: Primitive;
  subtype: string;
  value: string;
  normalizedValue: string | number | null;
  label: string;
  docId: DocId;
  sourceLine: number;
  blockId: BlockId | null;
}

interface BackendStats {
  totalDocuments: number;
  totalObjects: number;
  totalRelationships: number;
  lastIndexedAt: string | null;
  documentCountByType: Record<string, number>;
}
```

### SQLite Implementation

Uses `better-sqlite3` with WAL mode for concurrent read performance.

#### Connection Setup (`sqlite/connection.ts`)

```ts
function createConnection(dbPath: string): Database {
  const db = new BetterSqlite3(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  return db;
}
```

#### Database Schema (`sqlite/schema.ts`)

```sql
-- Documents table: one row per markdown file
CREATE TABLE IF NOT EXISTS documents (
  doc_id       TEXT PRIMARY KEY,
  doc_type     TEXT NOT NULL,
  schema_ref   TEXT NOT NULL,
  file_path    TEXT NOT NULL UNIQUE,
  file_hash    TEXT NOT NULL,
  version      INTEGER NOT NULL DEFAULT 1,
  frontmatter  TEXT NOT NULL,           -- JSON-serialized
  deleted      INTEGER NOT NULL DEFAULT 0,
  indexed_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(file_path);
CREATE INDEX IF NOT EXISTS idx_documents_deleted ON documents(deleted);

-- Extracted objects table: inline annotations and indexed fields
CREATE TABLE IF NOT EXISTS objects (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  primitive        TEXT NOT NULL,         -- entity, date, amount, quantity, location
  subtype          TEXT NOT NULL,         -- person, team, status, etc.
  value            TEXT NOT NULL,
  normalized_value TEXT,                  -- ISO date, number string, etc.
  label            TEXT NOT NULL,
  role             TEXT,
  doc_id           TEXT NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
  source_line      INTEGER NOT NULL,
  block_id         TEXT
);
CREATE INDEX IF NOT EXISTS idx_objects_primitive ON objects(primitive);
CREATE INDEX IF NOT EXISTS idx_objects_subtype ON objects(subtype);
CREATE INDEX IF NOT EXISTS idx_objects_value ON objects(value);
CREATE INDEX IF NOT EXISTS idx_objects_doc_id ON objects(doc_id);
CREATE INDEX IF NOT EXISTS idx_objects_normalized ON objects(normalized_value);

-- Relationships table: edges between documents
CREATE TABLE IF NOT EXISTS relationships (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source_doc_id   TEXT NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
  target_doc_id   TEXT NOT NULL,
  field           TEXT NOT NULL,
  relation_type   TEXT NOT NULL CHECK(relation_type IN ('ref', 'mention'))
);
CREATE INDEX IF NOT EXISTS idx_rel_source ON relationships(source_doc_id);
CREATE INDEX IF NOT EXISTS idx_rel_target ON relationships(target_doc_id);
CREATE INDEX IF NOT EXISTS idx_rel_type ON relationships(relation_type);

-- Blocks table: heading-delimited sections
CREATE TABLE IF NOT EXISTS blocks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id       TEXT NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
  block_id     TEXT,
  heading      TEXT NOT NULL,
  level        INTEGER NOT NULL,
  start_line   INTEGER NOT NULL,
  end_line     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_blocks_doc_id ON blocks(doc_id);
CREATE INDEX IF NOT EXISTS idx_blocks_block_id ON blocks(block_id);

-- Field index: denormalized frontmatter fields for fast filtering
CREATE TABLE IF NOT EXISTS field_index (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id       TEXT NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
  field_name   TEXT NOT NULL,
  field_value  TEXT,
  field_type   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_field_doc ON field_index(doc_id);
CREATE INDEX IF NOT EXISTS idx_field_name_value ON field_index(field_name, field_value);
```

#### Write Flow

All writes to the backend for a single document happen inside a transaction:

```ts
function materializeDocument(db: Database, extraction: ExtractionResult): void {
  const txn = db.transaction(() => {
    // 1. Remove previous data for this doc_id
    db.prepare('DELETE FROM objects WHERE doc_id = ?').run(docId);
    db.prepare('DELETE FROM relationships WHERE source_doc_id = ?').run(docId);
    db.prepare('DELETE FROM blocks WHERE doc_id = ?').run(docId);
    db.prepare('DELETE FROM field_index WHERE doc_id = ?').run(docId);

    // 2. Upsert document record
    db.prepare(`INSERT OR REPLACE INTO documents
      (doc_id, doc_type, schema_ref, file_path, file_hash, version, frontmatter, deleted, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(/* ... */);

    // 3. Insert extracted objects
    const insertObj = db.prepare(`INSERT INTO objects
      (primitive, subtype, value, normalized_value, label, role, doc_id, source_line, block_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const obj of extraction.objects) insertObj.run(/* ... */);

    // 4. Insert relationships
    const insertRel = db.prepare(`INSERT INTO relationships
      (source_doc_id, target_doc_id, field, relation_type) VALUES (?, ?, ?, ?)
    `);
    for (const rel of extraction.relationships) insertRel.run(/* ... */);

    // 5. Insert blocks
    const insertBlock = db.prepare(`INSERT INTO blocks
      (doc_id, block_id, heading, level, start_line, end_line) VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const block of extraction.document.parsed.blocks) insertBlock.run(/* ... */);

    // 6. Insert field index entries
    const insertField = db.prepare(`INSERT INTO field_index
      (doc_id, field_name, field_value, field_type) VALUES (?, ?, ?, ?)
    `);
    for (const [name, field] of Object.entries(extraction.document.validatedFields)) {
      if (field.indexed) insertField.run(/* ... */);
    }
  });
  txn();
}
```

#### Query Execution

`findDocuments` builds SQL dynamically from `DocumentQuery`:

```ts
function buildDocumentQuery(query: DocumentQuery): { sql: string; params: unknown[] } {
  const conditions: string[] = ['deleted = 0'];
  const params: unknown[] = [];

  if (query.docType) {
    conditions.push('doc_type = ?');
    params.push(query.docType);
  }

  if (query.filters) {
    for (const [field, condition] of Object.entries(query.filters)) {
      // Join against field_index for non-core fields
      // For core fields (doc_type, doc_id), query documents table directly
      const paramIndex = params.length;
      switch (condition.op) {
        case 'eq':
          conditions.push(`doc_id IN (SELECT doc_id FROM field_index WHERE field_name = ? AND field_value = ?)`);
          params.push(field, String(condition.value));
          break;
        case 'gte':
          conditions.push(`doc_id IN (SELECT doc_id FROM field_index WHERE field_name = ? AND field_value >= ?)`);
          params.push(field, String(condition.value));
          break;
        // ... other operators
      }
    }
  }

  const sql = `SELECT * FROM documents WHERE ${conditions.join(' AND ')}
    ORDER BY indexed_at DESC LIMIT ? OFFSET ?`;
  params.push(query.limit ?? 50, query.offset ?? 0);

  return { sql, params };
}
```

---

## Git Module

Thin integration layer using `simple-git`.

### Commit Builder (`commit.ts`)

```ts
interface CommitOptions {
  action: 'create' | 'update' | 'delete';
  docId: DocId;
  docType: DocType;
  detail: string;               // e.g. "fields:status", "body:append", "soft"
  summary: string;              // human-readable
  files: FilePath[];            // files to stage
}

function formatCommitMessage(opts: CommitOptions): string {
  return `maad:${opts.action} ${opts.docId} [${opts.docType}] ${opts.detail} — ${opts.summary}`;
}

// Regex to parse structured commit messages back into components
const COMMIT_PARSE_REGEX = /^maad:(\w+)\s+([\w-]+)\s+\[(\w+)\]\s*(.*?)\s*—\s*(.+)$/;

interface ParsedCommit {
  action: string;
  docId: DocId;
  docType: DocType;
  detail: string;
  summary: string;
  sha: CommitSha;
  author: string;
  timestamp: string;
}

function parseCommitMessage(message: string, sha: string, author: string, date: string): ParsedCommit | null;
```

### Auto-Commit (`commit.ts`)

```ts
interface GitCommitter {
  commit(opts: CommitOptions): Promise<Result<CommitSha>>;
}
```

Flow:
1. `git add <files>` — stage only the specified files
2. `git commit -m <formatted_message>` — commit with structured message
3. Return the commit SHA

If the project directory is not a git repo, return an error (don't silently skip).

### Log Parser (`log.ts`)

```ts
interface GitLog {
  getHistory(docId: DocId, opts?: { limit?: number; since?: string }): Promise<ParsedCommit[]>;
  getAudit(opts?: { since?: string; until?: string; docType?: DocType; action?: string }): Promise<AuditEntry[]>;
}

interface AuditEntry {
  docId: DocId;
  docType: DocType;
  actions: number;
  lastAction: string;
  lastSummary: string;
  lastAuthor: string;
  lastTimestamp: string;
}
```

Implementation:
- `getHistory`: Run `git log --follow -- <file_path>`, parse each commit message with `COMMIT_PARSE_REGEX`, filter to MAAD commits only
- `getAudit`: Run `git log --all --since=<date>`, parse all MAAD commits, group by `docId`, aggregate

### Diff Parser (`diff.ts`)

```ts
interface GitDiff {
  getDiff(docId: DocId, from: CommitSha, to?: CommitSha): Promise<DiffResult>;
}

interface DiffResult {
  docId: DocId;
  from: CommitSha;
  to: CommitSha;
  frontmatterChanges: Record<string, { from: unknown; to: unknown }>;
  bodyDiff: string;     // unified diff format
}
```

Implementation:
1. `git show <from>:<file_path>` — get old version
2. `git show <to>:<file_path>` — get new version (default HEAD)
3. Parse both frontmatters, compare field by field
4. `git diff <from>..<to> -- <file_path>` — get unified body diff

### Snapshot Reader (`snapshot.ts`)

```ts
interface GitSnapshot {
  getSnapshot(docId: DocId, at: string): Promise<SnapshotResult | null>;
}

interface SnapshotResult {
  docId: DocId;
  commit: CommitSha;
  timestamp: string;
  frontmatter: Record<string, unknown>;
  body: string;
}
```

Implementation:
- If `at` looks like a SHA, use directly
- If `at` is an ISO date, resolve: `git log -1 --before=<date> --format=%H -- <file_path>`
- `git show <sha>:<file_path>` — get the file content at that commit
- Parse frontmatter from the historical content

### Public API

```ts
// git/index.ts
interface GitLayer {
  committer: GitCommitter;
  log: GitLog;
  diff: GitDiff;
  snapshot: GitSnapshot;
  isRepo(): Promise<boolean>;
  initRepo(projectRoot: string): Promise<void>;
}
```

---

## Engine Pipeline

The engine orchestrates the 6-stage pipeline. It is the central coordinator.

```ts
// engine.ts
interface MaadEngine {
  // Setup
  init(projectRoot: string): Promise<Result<void>>;

  // Full pipeline
  indexAll(opts?: { force?: boolean }): Promise<IndexResult>;
  indexFile(filePath: FilePath): Promise<Result<ExtractionResult>>;

  // CRUD (called by MCP tools)
  createDocument(docType: DocType, fields: Record<string, unknown>, body?: string, docId?: string): Promise<Result<CreateResult>>;
  getDocument(docId: DocId, depth: 'hot' | 'warm' | 'cold', block?: string): Promise<Result<GetResult>>;
  findDocuments(query: DocumentQuery): Promise<Result<FindResult>>;
  updateDocument(docId: DocId, fields?: Record<string, unknown>, body?: string, appendBody?: string, version?: number): Promise<Result<UpdateResult>>;
  deleteDocument(docId: DocId, mode: 'soft' | 'hard'): Promise<Result<DeleteResult>>;

  // Navigation
  listRelated(docId: DocId, direction: 'outgoing' | 'incoming' | 'both', types?: DocType[]): Promise<Result<RelatedResult>>;
  searchObjects(query: ObjectQuery): Promise<Result<SearchResult>>;

  // Audit (delegates to GitLayer)
  history(docId: DocId, opts?: { limit?: number; since?: string }): Promise<Result<ParsedCommit[]>>;
  diff(docId: DocId, from: string, to?: string): Promise<Result<DiffResult>>;
  snapshot(docId: DocId, at: string): Promise<Result<SnapshotResult>>;
  audit(opts?: { since?: string; until?: string; docType?: DocType }): Promise<Result<AuditEntry[]>>;

  // Maintenance
  validate(docId?: DocId): Promise<Result<ValidationReport>>;
  reindex(opts?: { docId?: DocId; force?: boolean }): Promise<Result<IndexResult>>;

  // Discovery
  describe(): Promise<DescribeResult>;
  getSchema(docType: DocType): SchemaDefinition | null;
  inspect(docId: DocId): Promise<Result<InspectResult>>;
}

interface IndexResult {
  scanned: number;
  indexed: number;
  skipped: number;
  errors: MaadError[];
}
```

### Stage Execution: `indexFile`

This is the core pipeline for a single file:

```ts
async function indexFile(filePath: FilePath): Promise<Result<ExtractionResult>> {
  // Stage 1: Registry and schemas already loaded during init()

  // Stage 2: Change detection
  const currentHash = await hashFile(filePath);
  const storedHash = await backend.getFileHash(filePath);
  if (currentHash === storedHash && !force) return ok(/* cached */);

  // Stage 3: Parse
  const parsed = await parser.parse(filePath);
  if (!parsed.ok) return parsed;

  // Stage 4: Bind schema
  const docType = parsed.value.frontmatter.doc_type as string;
  const schema = schemaStore.getSchemaForType(docType as DocType);
  if (!schema) return err([{ code: 'UNKNOWN_TYPE', message: `...` }]);

  const validation = schemaValidator.validate(parsed.value.frontmatter, schema, registry);
  const bound: BoundDocument = {
    parsed: parsed.value,
    docId: parsed.value.frontmatter.doc_id as DocId,
    docType: docType as DocType,
    schemaRef: schema.type + '.v' + schema.version as SchemaRef,
    validatedFields: /* map validated fields */,
    validationResult: validation,
  };

  // Stage 5: Extract
  const extraction = extractor.extract(bound, schema);

  // Stage 6: Materialize
  await backend.putDocument(/* DocumentRecord from bound */);
  await backend.putObjects(extraction.objects);
  await backend.putRelationships(extraction.relationships);
  await backend.putBlocks(bound.docId, parsed.value.blocks);

  return ok(extraction);
}
```

### Write Flow: `createDocument`

```ts
async function createDocument(
  docType: DocType,
  fields: Record<string, unknown>,
  body?: string,
  customDocId?: string
): Promise<Result<CreateResult>> {
  // 1. Look up registry type and schema
  const regType = registry.types.get(docType);
  const schema = schemaStore.getSchemaForType(docType);

  // 2. Generate doc_id if not provided
  const docId = customDocId
    ? docId(customDocId)
    : generateDocId(regType, fields);

  // 3. Build frontmatter
  const frontmatter = {
    doc_id: docId,
    doc_type: docType,
    schema: regType.schemaRef,
    ...fields,
  };

  // 4. Validate against schema (structural, not ref existence yet)
  const validation = schemaValidator.validate(frontmatter, schema, registry);
  if (!validation.valid) return err(validation.errors);

  // 5. Generate markdown via writer
  const markdown = writer.generate(frontmatter, schema, body);

  // 6. Write file to disk
  const filePath = path.join(regType.path, `${docId}.md`);
  await writeFile(filePath, markdown);

  // 7. Index the new file
  const indexed = await indexFile(filePath as FilePath);

  // 8. Git commit
  await git.committer.commit({
    action: 'create',
    docId,
    docType,
    detail: '',
    summary: String(fields.name ?? fields.title ?? docId),
    files: [filePath as FilePath],
  });

  return ok({ docId, filePath, version: 1, validation });
}
```

---

## Document Writer

Generates markdown files from schema definitions, field values, and body content. This is the deterministic authoring system.

```ts
// writer/index.ts
interface DocumentWriter {
  generate(
    frontmatter: Record<string, unknown>,
    schema: SchemaDefinition,
    body?: string
  ): string;

  updateFrontmatter(
    existingContent: string,
    fieldUpdates: Record<string, unknown>
  ): string;

  appendBody(
    existingContent: string,
    additionalBody: string
  ): string;
}
```

### Template Generation (`template.ts`)

When a schema defines a `template.headings` array, the writer generates the body structure:

```ts
function generateTemplateBody(schema: SchemaDefinition, fields: Record<string, unknown>): string {
  if (!schema.template) return '';

  return schema.template.headings.map(h => {
    const prefix = '#'.repeat(h.level);
    let text = h.text;

    // Resolve {{field}} references in heading text
    text = text.replace(/\{\{(\w+)\}\}/g, (_, key) => String(fields[key] ?? key));

    const anchor = h.id ? ` {#${h.id}}` : '';
    return `${prefix} ${text}${anchor}\n`;
  }).join('\n');
}
```

### YAML Serializer (`serializer.ts`)

Serializes frontmatter back to YAML, preserving field order from the schema:

```ts
function serializeFrontmatter(
  frontmatter: Record<string, unknown>,
  schema: SchemaDefinition
): string {
  // Order: doc_id, doc_type, schema first, then required fields, then optional fields
  const ordered: string[] = [];
  const coreKeys = ['doc_id', 'doc_type', 'schema'];

  for (const key of coreKeys) {
    if (key in frontmatter) ordered.push(serializeField(key, frontmatter[key]));
  }
  for (const key of schema.required) {
    if (!coreKeys.includes(key) && key in frontmatter) {
      ordered.push(serializeField(key, frontmatter[key]));
    }
  }
  for (const key of Object.keys(frontmatter)) {
    if (!coreKeys.includes(key) && !schema.required.includes(key)) {
      ordered.push(serializeField(key, frontmatter[key]));
    }
  }

  return `---\n${ordered.join('\n')}\n---`;
}
```

---

## MCP Server

The MCP server wraps the engine and exposes all 15 tools via stdio transport.

```ts
// server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

async function startServer(projectRoot: string) {
  const engine = new MaadEngine();
  await engine.init(projectRoot);

  const server = new Server(
    { name: 'maad', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  // Register all 15 tools
  registerDiscoveryTools(server, engine);    // describe, schema, inspect
  registerCrudTools(server, engine);          // create, get, find, update, delete
  registerNavigationTools(server, engine);    // list_related, search_objects
  registerAuditTools(server, engine);         // history, diff, snapshot, audit
  registerMaintenanceTools(server, engine);   // validate, reindex

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

Each tool file maps the MCP tool call to an engine method, handling input validation and response formatting. See [MAAD-TOOLS.md](MAAD-TOOLS.md) for the full input/output schemas.

---

## CLI

Lightweight CLI for human-facing operations. Wraps the engine.

```ts
// cli.ts
const commands = {
  'init':      initProject,     // scaffold _registry/, _schema/, .gitignore, git init
  'parse':     parseFile,       // parse a single file and print the ParsedDocument
  'validate':  validateDocs,    // run schema validation, print results
  'reindex':   reindexAll,      // rebuild the backend from markdown
  'query':     queryIndex,      // query the index and print results
  'serve':     startServer,     // start the MCP server
};
```

### `maad init`

```ts
async function initProject(dir: string) {
  // 1. Create _registry/ directory
  // 2. Create _registry/object_types.yaml with empty types: {} stub
  // 3. Create _schema/ directory
  // 4. Create .gitignore with _backend/
  // 5. git init (if not already a repo)
  // 6. Create _backend/ directory
  // 7. Print success message with next steps
}
```

---

## Error Handling

All errors use a typed error structure. The engine never throws — it returns `Result<T, MaadError[]>`.

```ts
type ErrorCode =
  | 'FILE_NOT_FOUND'
  | 'PARSE_ERROR'
  | 'YAML_PROFILE_VIOLATION'
  | 'REGISTRY_INVALID'
  | 'SCHEMA_NOT_FOUND'
  | 'SCHEMA_INVALID'
  | 'VALIDATION_FAILED'
  | 'REF_NOT_FOUND'
  | 'DUPLICATE_DOC_ID'
  | 'VERSION_CONFLICT'
  | 'GIT_ERROR'
  | 'BACKEND_ERROR'
  | 'UNKNOWN_TYPE';

interface MaadError {
  code: ErrorCode;
  message: string;
  location?: SourceLocation;
  details?: Record<string, unknown>;
}
```

### Error Accumulation

The pipeline accumulates errors across documents rather than failing on the first one. A single `indexAll` call may produce partial results — successfully indexed documents alongside errored ones.

```ts
interface IndexResult {
  scanned: number;
  indexed: number;
  skipped: number;
  errors: MaadError[];           // errors from all documents, with file paths
}
```

---

## Testing Strategy

### Test Structure

```
tests/
  parser/
    frontmatter.test.ts      # YAML extraction, edge cases
    blocks.test.ts            # heading splitting, anchor detection
    tags.test.ts              # {{field}} extraction, verbatim zone respect
    annotations.test.ts       # [[type:value|label]] extraction, primitive resolution
  schema/
    loader.test.ts            # schema file loading and validation
    validator.test.ts         # field type validation, ref checking
  registry/
    loader.test.ts            # registry loading and validation
  extractor/
    fields.test.ts            # frontmatter field extraction
    objects.test.ts           # annotation to object conversion
    normalizers.test.ts       # date, amount, quantity normalization
    relationships.test.ts     # ref and mention relationship building
  backend/
    sqlite.test.ts            # CRUD operations, query building, transactions
  git/
    commit.test.ts            # message formatting and parsing
  engine/
    pipeline.test.ts          # full pipeline integration test
    crud.test.ts              # create/read/update/delete flows
  writer/
    template.test.ts          # deterministic markdown generation
    serializer.test.ts        # frontmatter serialization
  fixtures/
    simple-crm/               # example project for integration tests
    meeting-notes/
    freeform-narrative/
```

### Testing Approach

- **Unit tests** for each module in isolation. Mock the backend for parser/extractor tests.
- **Integration tests** using the fixture projects. Run the full pipeline and assert on backend state.
- **Backend tests** use a fresh in-memory SQLite database per test.
- **Git tests** use a temporary directory with `git init`.
- **No snapshot tests** — assert on structure, not on exact string output.

### Key Test Cases

**Parser:**
- File with no frontmatter
- Frontmatter with all field types
- Code blocks containing `{{}}` and `[[]]` (must not extract)
- Inline code spans containing annotations (must not extract)
- Nested headings with `{#id}` anchors
- Heading inside a fenced code block (must not create a block boundary)
- Multiple annotations on a single line
- Annotation with special characters in value or label

**Schema Validator:**
- All required fields present -> valid
- Missing required field -> error
- Wrong type for field -> error
- Enum field with invalid value -> error
- Ref field with nonexistent target -> soft warning
- Date field with wrong format -> error

**Normalizers:**
- Date: "March 28, 2026", "2-25-26", "2026-03-28", "2026-03-28T14:30:00Z"
- Duration: "3 hours" -> PT3H, "2 weeks" -> P2W, "1 hour 30 minutes" -> PT1H30M
- Amount: "100.00 USD", "$100", "€50"
- Measure: "500mg", "6 feet", "98.6°F", "1200 sqft"
- Quantity: "42", "3.5"
- Percentage: "15%", "85 percent", "0.15"
- Contact: email lowercase, phone E.164, URL normalize, auto-detect from pattern
- Media: extension -> media type mapping (.jpg -> image, .mp4 -> video, .pdf -> document)
- Edge cases: empty strings, malformed values -> null for all normalizers

**Git:**
- Commit message round-trip: format -> parse -> same fields
- History filtering by doc_id
- Snapshot at date resolves to correct commit

---

## Dependencies

```json
{
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "gray-matter": "^4.0.3",
    "simple-git": "^3.27.0",
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^22.0.0"
  }
}
```

Total production dependencies: **4**. No frameworks. No ORMs. No bundlers.

---

## Project Configuration

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

Key flags:
- `strict: true` — all strict checks enabled
- `noUncheckedIndexedAccess: true` — forces handling `undefined` on index access (critical for a database system)
- `exactOptionalPropertyTypes: true` — distinguishes `undefined` from "not set"
- `module: Node16` — native ESM with `.js` extensions in imports

### `vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/cli.ts', 'src/server.ts'],
    },
  },
});
```

---

*This is the implementation guide for MAAD. Every module, interface, type, parse rule, SQL schema, and behavior is specified here. Build from `types.ts` outward.*
