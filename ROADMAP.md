# MAADB Roadmap

## Shipped

### v0.1.x — Foundation (2026-04-06)

- Core type system (branded IDs, 11 primitives, extensible subtype map)
- Parser (frontmatter, blocks, inline annotations, verbatim zone safety)
- Registry + schema system (YAML loader, validator, 8 field types, ref targets, templates)
- Extractor (11 normalizers, field extraction, annotation objects, relationships)
- SQLite backend (WAL mode, full query builder)
- Engine (6-stage pipeline, CRUD, tiered reads, relationship traversal)
- Writer (deterministic YAML serialization, template body generation)
- Git integration (auto-commit, structured messages, history, audit, diff)
- CLI (11 commands)
- Production hardening (durable writes, path security, error policy, batch queries, pagination)

### v0.2.x — MCP Server + Query Power (2026-04-07 through 2026-04-08)

- Pointer-only DB — SQLite stores pointers only, all content reads from files
- MCP server with stdio transport and role-based access (reader/writer/admin)
- LLM UX layer: `summary`, `get full`, `schema` commands
- Query projection (return only requested fields)
- Aggregation tool (`count`, `sum`, `avg`, `min`, `max` grouped by field)
- Cross-ref joins (`maad_join` — query + follow refs + project both sides)
- Bulk operations (`bulk_create`, `bulk_update` — single git commit)
- Provenance mode (`--prov off|on|detail`)
- Architect skill — autonomous database design and deployment
- Static MAAD.md generation
- 266 tests, 4 production dependencies

### v0.4.0 — Multi-Project Routing (2026-04-14)

- `instance.yaml` declares multiple projects served by one MCP server
- Session-bound mode: `maad_use_project` (single) or `maad_use_projects` (multi whitelist); session-level role downgrade via `as=<role>`
- `EnginePool` lazy-loads engines per project; eviction seam exposed, policy deferred to 0.9.0
- `SessionRegistry` keyed by MCP-SDK session IDs — HTTP/SSE-ready for 0.5.0 remote transport
- 4 instance-level tools (`maad_projects`, `maad_use_project`, `maad_use_projects`, `maad_current_session`); all 22 existing tools become routable
- Backward-compatible `--project` / `--role` single-project mode (auto-bind to synthetic `default` project)
- 57 new tests, 323 total passing

### v0.4.1 — Production Hardening (2026-04-15)

Hardened the write path and operational surface before exposing the engine over a network transport. No tool-surface changes beyond new error codes and extended `maad_health`.

- Per-engine FIFO write mutex (`AsyncFifoMutex`, `runExclusive` wrapper) — serializes all 9 mutating engine methods
- Stale `.git/index.lock` recovery on init (30s mtime threshold, refuses to start if lock is recent)
- Idempotency keys — `(project, tool, key)` scoped LRU cache (10-min TTL, 10k max), replay identified via `_meta.replayed` + `_meta.original_request_id`
- Per-session token-bucket rate limiting (writes/sec=10, writes/min=60, concurrent=5) + 1 MiB payload cap
- Structured JSON logging (pino) with separate ops + audit channels, per-request `request_id` threaded through responses
- Per-request timeout (30s default) + graceful shutdown state machine (running → draining → exiting)
- Extended `maad_health`: writeQueueDepth, lastWriteOp, lastWriteAt, repoSizeBytes (cached 60s), gitClean, diskHeadroomMb
- New error codes: `RATE_LIMITED`, `REQUEST_TIMEOUT`, `SHUTTING_DOWN`, `WRITE_TIMEOUT` (reserved for 0.8.5)
- 71 new tests across mutex/concurrency/idempotency/rate-limit/logging/lifecycle/health-extensions modules, 394 total passing

### v0.5.0 — Remote MCP Transport (2026-04-15)

Engine served over HTTP/SSE so MCP clients can connect across the network. One server process handles many concurrent client sessions. Builds on the 0.4.0 `SessionRegistry` (keyed by HTTP session ID) and the 0.4.1 hardened engine. stdio remains the default for local use.

- [x] HTTP/SSE transport via `StreamableHTTPServerTransport` (MCP SDK 1.29+), `node:http` with explicit headers/request/keep-alive timeouts, response hardening (`nosniff` + `no-store`), 128-bit CSPRNG session IDs
- [x] Bearer-token auth at handshake — constant-time compare (`crypto.timingSafeEqual`), 401 precedes 404 so unauth callers can't enumerate sessions, pino redaction on the authorization header
- [x] Session lifecycle fan-out — `registerCloseHandler`, idempotent `destroy(sid, reason)`, `peek` without bumping `lastActivityAt`, rate-limit dispose on close
- [x] Idle sweeper — inbound-only activity clock, evicts zombie SSE streams past `MAAD_SESSION_IDLE_MS` (30 min default)
- [x] `OperationKind` (`read` / `write`) classification per tool, reentrant write mutex via AsyncLocalStorage — concurrent reads while a write holds the lock, deadlock-free re-entry from engine methods
- [x] `maad_changes_since` polling delta — opaque base64url cursor, strict tuple ordering on `(updated_at, doc_id)`, deterministic pagination, operation classification from document version
- [x] Extended `maad_health` — `transport {kind, host?, port?, uptimeSeconds}` and `sessions {active, openedTotal, closedTotal, lastOpenedAt, lastClosedAt, idleSweepLastRunAt}`
- [x] Unauthenticated `GET /healthz` liveness probe — 200 `{ok:true}` live / 503 `SHUTTING_DOWN` during drain, no state leak in body, not exposed under stdio
- [x] Audit + ops events — `session_open`, `session_close`, `auth_failure`, `idle_sweep` on their channels
- [x] Deploy guides — [systemd + nginx (bare metal)](docs/deploy/systemd.md), [Docker + traefik](docs/deploy/docker.md)
- [x] TLS terminated at reverse proxy (documented, not enforced in-engine)

82 new tests (transport/auth/lifecycle/concurrency/changes-since/healthz/health-telemetry), 476 total passing. Spec at [`docs/specs/0.5.0-remote-mcp.md`](docs/specs/0.5.0-remote-mcp.md).

---

## Current: v0.5.0

See Shipped block above.

---

## Planned

### 0.5.1 — Deployment Workflow

Zero-to-operational in one agent session. Builds on 0.4.0 multi-project mode and the 0.4.1 hardened engine.

- [ ] `_skills/deploy.md` — agent-guided instance setup (prerequisites, scaffolding, `instance.yaml`, MCP config, Architect handoff per project)
- [ ] README deployment section validated against fresh installs (instance-first)
- [ ] Platform-specific MCP config generation (Claude Code, Claude Desktop, generic stdio + HTTP) — emits instance-mode configs by default
- [ ] `maad init-instance` CLI command — scaffolds `instance.yaml` and directory layout
- [ ] `maad add-project <name> <path>` CLI command — appends to `instance.yaml`, creates project dir if missing
- [ ] Verify deploy → `maad_use_project` → architect → operational flow end-to-end

### 0.6.0 — npm Package Prep

Pulled forward from 0.8.0. Makes the engine trivially installable into container images and remote deployments.

- [ ] Clean up public API surface
- [ ] `npx maad serve` works without cloning the repo
- [ ] Package published to npm
- [ ] MCP configs simplify to `npx maad` instead of absolute paths
- [ ] Getting started guide for new users

### 0.7.0 — Import Workflow

Recurring import of raw files into MAADB projects.

- [ ] `_inbox/` directory convention (drop zone for raw files)
- [ ] `_skills/import-workflow.md` — agent-guided inbox processing
- [ ] Source tracking fields (`source_file`, `source_hash`) as schema convention
- [ ] Duplicate detection via `source_hash` query before create
- [ ] Readonly type flag — engine rejects updates on readonly types
- [ ] Delete source from `_inbox/` after successful import
- [ ] Test with static catalog archetype

### 0.7.5 — LLM Evaluation

Prove the engine works across models and use cases with real data. Deferred from 0.3.0 slot — production hardening and remote transport took priority.

- [ ] Multi-model testing (Claude, GPT, Gemini) against maadb-demo
- [ ] Identify friction points in tool usage, schema design, and boot flow
- [ ] Document what works and what breaks per model
- [ ] Benchmark: token usage, call count, accuracy on structured tasks
- [ ] Test the Architect skill end-to-end: vague prompt → working database

### 0.8.0 — Provenance + Admin Tooling

Better visibility into what happened and why.

- [ ] Provenance refinement — cleaner source attribution in responses
- [ ] Admin dashboard tool — project health, index stats, schema drift detection
- [ ] `maad_export` — dump project data in portable format
- [ ] Improved error messages with actionable guidance

### 0.8.5 — Remote MCP Hardening

Promote remote transport from "minimal" to "operator-grade" based on real 0.5.0 usage signal.

- [ ] Per-connection role tiers (reader / writer / admin) with token → role mapping
- [ ] Configurable rate limit policy per token or tier
- [ ] Backpressure / queue depth thresholds with tunable 429 response
- [ ] Mutex timeout with `WRITE_TIMEOUT` error path (replaces infinite block from 0.4.1)
- [ ] Full concurrency stress test suite
- [ ] Metrics export (Prometheus or OTEL)
- [ ] `git gc` automation / scheduled maintenance

### 0.9.0 — Query Power

Make the index smarter.

- [ ] Full-text search via SQLite FTS5
- [ ] Fuzzy entity matching (typo-tolerant search)
- [ ] Compound filters (AND/OR in `maad_query`)
- [ ] Sort by any indexed field
- [ ] Cursor-based pagination tokens

### 0.9.5 — Object Attributes

User-defined metadata on extracted objects.

- [ ] Attribute definitions in `_registry/object_types.yaml`
- [ ] Attribute assignments in `_registry/object_tags.yaml`
- [ ] SQLite `object_attributes` table, rebuilt on reindex
- [ ] Query support: filter objects by attribute values
- [ ] CLI/MCP commands to read/write attributes (writes go to YAML + git commit)

### 1.0.0 — Stable Release

- [ ] API locked — no breaking changes after this
- [ ] npm package published and documented
- [ ] Full test coverage across all MCP tools
- [ ] Migration guide from pre-1.0 projects

---

## Future (unscoped)

These are ideas, not commitments. They'll get scoped when the time comes.

**Schema evolution** — migration tooling (v1 → v2 field mapping), backwards-compatible field additions, schema diffing

**Writer enhancements** — section-level body updates, partial reindex after frontmatter-only changes

**Advanced extraction** — LLM-assisted inference extraction, confidence scoring, extraction review workflow

**Vector search** — embeddings for markdown body content, semantic search alongside structured queries, hybrid retrieval

**Ecosystem** — VS Code extension, web UI for browsing/querying, agent SDK bindings

**Enterprise** — immutable document versions, queryable audit event store, role-based access control on documents, multi-tenant isolation, encryption at rest
