# MAAD Roadmap

## Completed (v0.1.0)

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
- [x] Example project: Simple CRM fixture (client, contact, case, case_note)

## Near-Term

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

### Additional Example Projects

- [ ] Meeting Notes example (semi-structured: date, participants, list items)
- [ ] Freeform Narrative example (investigation report with inline annotations)
- [ ] Run all three examples through the full pipeline and document results

### Testing & Polish

- [ ] CLI integration tests (automated, not just manual verification)
- [ ] Error message improvements (more actionable guidance)
- [ ] `maad init` generates a starter schema for common patterns
- [ ] Documentation: getting started guide

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

*Priorities may shift based on real-world usage. The MCP server is the immediate next step — it's what makes MAAD a tool for LLMs, not just a tool for developers.*
