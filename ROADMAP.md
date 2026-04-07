# MAAD Roadmap

## Completed

### v0.1.0 — 2026-04-06

- [x] Core type system (branded IDs, 11 primitives, extensible subtype map)
- [x] Parser (frontmatter, blocks, `{{field}}`, `[[type:value|label]]`, verbatim zone safety)
- [x] Registry system (loader, validator, extraction config)
- [x] Schema system (loader, 8 field types, ref targets, templates, validator)
- [x] Extractor (11 normalizers, field extraction, annotation objects, relationships)
- [x] Backend adapter interface + SQLite implementation (WAL, full query builder)
- [x] Engine (6-stage pipeline, CRUD, tiered reads, relationship traversal)
- [x] Writer (deterministic YAML serialization, template body generation)
- [x] Git integration (auto-commit, structured messages, history, audit, diff, snapshot)
- [x] CLI (11 commands: init, parse, validate, reindex, describe, query, get, search, related, history, audit)
- [x] Test fixture: Simple CRM (client, contact, case, case_note)

### v0.1.1 — 2026-04-07

- [x] Git boundary detection (checks .git at project root, not parent)
- [x] Reindex stale row cleanup (removes orphaned records for deleted files)
- [x] Numeric query semantics (REAL column for correct range comparisons)
- [x] Write-path recovery warnings (logs hint if indexing fails after file write)
- [x] YAML profile enforcement (rejects deep nesting >2, multi-document YAML)
- [x] List-of-ref relationship support (validator + extractor, one edge per array element)
- [x] Round-trip authoring stability (proven across create -> update -> reindex cycles)
- [x] Test isolation hardening, MCP stub cleanup (3 production deps)

---

## In Progress

### Storage Boundary + LLM UX Refactor (v0.1.3)

Two-checkpoint refactor. See detailed plan in ROADMAP-DETAILED.md.

**Checkpoint 1: Pointer-only DB**
- [ ] Prove block pointer warm reads work (test: file slice at start_line:end_line matches current content)
- [ ] Drop `frontmatter` from DocumentRecord + SQLite documents table
- [ ] Drop `content` from ParsedBlock + SQLite blocks table
- [ ] Add `readFrontmatter()` helper — reads file, parses via gray-matter
- [ ] Update getDocument, updateDocument, validate, inspect to read from file
- [ ] All tests green

**Checkpoint 2: LLM UX Layer**
- [ ] `summary` command — one-call project orientation (types, counts, object inventory, recent activity)
- [ ] `get <id> full` — resolved record with context (refs resolved, latest note, extracted objects, related records)
- [ ] `schema <type>` command — field definitions for write operations
- [ ] Static MAAD.md (remove volatile data, only regenerate if missing)
- [ ] Concurrency hardening (read-only connection mode)

---

## Near-Term

### maad-demo

Product showcase and template engine demo. Separate repo: `patchnetluis/maad-demo`.

**Demo 1: Legal CRM Application**
- [ ] Seed data: ~10 clients, ~15 contacts, ~12 cases, ~25 case notes
- [ ] Rich inline annotations across all 11 primitives
- [ ] Cross-document relationship graph with meaningful traversal paths
- [ ] Custom extraction subtypes (attorney, judge, witness, filing_date, settlement_amount)
- [ ] Scripted demos: overview, query, relationships, tiered reads, CRUD, audit

**Demo 3: Template Engine (inside maad-demo)**
- [ ] Document templates: demand letter, case summary, client briefing memo
- [ ] Template definitions in YAML (fields, sections, format rules)
- [ ] Scripted demos: draft letter from case data, generate case summary from case + notes
- [ ] Consistency demo: run same generation 5x, compare output stability

### MCP Server (v0.2.0)

The primary LLM interface. Thin wrapper over the engine — 15 tools across 5 categories.

- [ ] MCP server entry point (`maad serve`)
- [ ] Discovery tools: `describe`, `schema`, `inspect`
- [ ] CRUD tools: `create`, `get`, `find`, `update`, `delete`
- [ ] Navigation tools: `list_related`, `search_objects`
- [ ] Audit tools: `history`, `diff`, `snapshot`, `audit`
- [ ] Maintenance tools: `validate`, `reindex`
- [ ] MCP stdio transport
- [ ] Connection config documentation (for Claude Desktop, etc.)
- [ ] Tool input/output schema validation

Reference: [MAAD-TOOLS.md](MAAD-TOOLS.md) has the full tool spec with JSON schemas.

### maad-benchmark (after MCP server)

A/B evaluation proving MAAD's value as an LLM interface layer. Separate repo: `patchnetluis/maad-benchmark`.

**Thesis:** "Compared with raw document retrieval, MAAD reduces LLM token usage, improves grounded cross-document retrieval, and produces more repeatable structured outputs on document-centric tasks."

**Corpus:**
- [ ] 500-1000 synthetic legal case records (generated via MAAD engine)
- [ ] Controlled entity density, cross-doc relationships, date ranges
- [ ] Gold answers human-curated (we know answers because we wrote the data)

**Two conditions (same model, same corpus, same questions):**
- [ ] Condition A: Raw document interface (chunk retrieval, no MAAD index)
- [ ] Condition B: MAAD interface (parsed records, object index, relationship graph, tiered reads)

**Four task classes:**
- [ ] Fact lookup — filing date, amount, contact, status (test token efficiency + exact retrieval)
- [ ] Filtered retrieval — find all open matters for org X, records mentioning person Y in March (test indexed access vs raw search)
- [ ] Cross-document traversal — related records, entity-event connections, timeline assembly (test graph value over isolated reads)
- [ ] Deterministic authoring — create compliant note, update record, insert structured metadata (test reproducibility)

**Metrics per task class:**
- [ ] Exact Match (EM) / Precision / Recall / F1
- [ ] Prompt tokens / total tokens / token reduction
- [ ] Latency (avg, p95)
- [ ] Hallucination rate / citation grounding rate
- [ ] Consistency score across 5-10 repeated runs
- [ ] Schema-valid output rate (authoring tasks)

**Infrastructure:**
- [ ] Task runner (executes tasks against both conditions)
- [ ] Scorer (scores answers against gold)
- [ ] Retrieval logger (docs opened, tiers used, tokens sent, latency)
- [ ] Reporter (comparison tables by task class + overall summary)

**Success criteria:**
- Significantly lower token consumption
- Equal or better accuracy
- Better performance on linked-record tasks
- Lower hallucination / higher grounding
- Much better deterministic writing consistency

### Testing & Polish

- [ ] CLI integration tests (automated, not just manual verification)
- [ ] Error message improvements (more actionable guidance)
- [ ] `maad init` generates a starter schema for common patterns
- [ ] Documentation: getting started guide

---

## Mid-Term

### Reverse Import Tooling (v0.3.0)

The architecture supports bidirectional flow. Converter scripts bring existing data into MAAD.

- [ ] CSV-to-MAAD converter (field mapping config -> markdown files)
- [ ] JSON-to-MAAD converter (schema inference -> registry + schemas + files)
- [ ] SQL export converter (query -> markdown records)
- [ ] Dataverse/API record converter

### Query Enhancements

- [ ] Full-text search via SQLite FTS5
- [ ] Compound filters (AND/OR)
- [ ] Sort by any indexed field
- [ ] Aggregation queries (count, sum over indexed numeric fields)
- [ ] Pagination tokens (cursor-based, not offset)

### Schema Evolution

- [ ] Schema migration tooling (v1 -> v2 field mapping)
- [ ] Backwards-compatible field additions without migration
- [ ] Schema diffing tool

### Writer Enhancements

- [ ] Section-level body updates (update a specific block without rewriting the whole file)
- [ ] Partial reindex after frontmatter-only updates (skip full parse)
- [ ] Markdown formatting options (line wrapping, list style)

---

## Long-Term

### Multi-User & Collaboration

- [ ] Git branching workflows (draft -> review -> approve)
- [ ] GPG commit signing for compliance
- [ ] Conflict resolution UI (visual merge for concurrent edits)
- [ ] Remote push/sync (GitHub/GitLab integration)

### Advanced Extraction

- [ ] LLM-assisted inference extraction (auto-detect entities, dates from unstructured text)
- [ ] Confidence scoring on extracted objects
- [ ] Extraction review/approval workflow
- [ ] Custom extraction rules via YAML config

### Vector Search

- [ ] Vector embeddings for markdown body content
- [ ] Semantic search alongside structured queries
- [ ] Hybrid retrieval (structured + semantic)

### Ecosystem

- [ ] Obsidian plugin (read-only query layer via Dataview bridge)
- [ ] VS Code extension (schema validation, inline annotation highlighting)
- [ ] Web UI for browsing and querying a MAAD project
- [ ] npm package published (`npm install maad`)
- [ ] Agent SDK bindings (OpenAI function calling, LangChain tools)

### Enterprise

- [ ] Immutable document versions (append-only with delta chains)
- [ ] Audit event store (beyond git — queryable event log)
- [ ] Role-based access control on documents and types
- [ ] Multi-tenant project isolation
- [ ] Encryption at rest for sensitive markdown records

---

## Repos

| Repo | Purpose | Status |
|------|---------|--------|
| `patchnetluis/maad` | Engine framework (this repo) | v0.1.1 — 192 tests, 3 deps |
| `patchnetluis/maad-demo` | Product showcase + template engine | Next up |
| `patchnetluis/maad-benchmark` | A/B evaluation proving the thesis | After MCP server |

---

*Build order: maad-demo first (immediate showcase), MCP server second (LLM interface), maad-benchmark third (prove the thesis with data).*
