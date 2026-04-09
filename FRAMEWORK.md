# MAAD Framework

## What MAAD Is

An LLM-native database engine that treats markdown files as canonical and gives LLMs deterministic read/write access to unstructured data sources.

LLMs first. Humans interface via the LLM agent, not directly.

The goal is speed, efficiency, and a world model for data categorization — who, what, when, where, how, and **why**. Keeping markdown as canonical is the key to covering all six dimensions. Traditional databases capture fragments. Markdown carries the full narrative.

## Data Doctrine

1. **Markdown is canonical.** The markdown file is the record. It carries the complete picture — structured fields in frontmatter, addressable sections via headings, and the narrative that explains *why*.

2. **SQLite is derived.** The database is a rebuildable pointer index. Delete it, reindex, nothing is lost. It exists for query speed, not as a source of truth.

3. **The parser is interpretive, not authoritative.** The engine reads and indexes what the markdown says. It does not decide what the markdown should say.

4. **The agent never writes around the engine.** All mutations to markdown records go through engine tools. No direct file edits. This preserves validation, indexing, and the git audit trail.

5. **YAML is the interface language.** Registry, schemas, and configuration are YAML. YAML syntax, MAAD semantics — only MAAD-approved keys and patterns are accepted.

## Tier Model

The engine is lean. The LLM is smart. Push composition up, keep primitives down.

### Tier 1 — Primitive Engine

Single deterministic pass. One input, one output. No composition, no judgment.

**Test:** Can this operation complete with one backend query or one file read? If yes, it belongs here.

| Command | Operation |
|---------|-----------|
| `scan` | Structural analysis of raw markdown (no registry needed) |
| `summary` | Index-backed project snapshot (no file scan, no git) |
| `describe` | Project overview from registry + stats |
| `get hot` | Read frontmatter from file |
| `get warm` | Read frontmatter + one block via line pointers |
| `get cold` | Read full file body |
| `query` | Find documents by type + field filters + projection |
| `search` | Find extracted objects by primitive/subtype/value |
| `related` | Graph traversal — outgoing/incoming/both |
| `schema` | Field definitions, ID prefix, format hints |
| `aggregate` | Group by field + optional metric (count/sum/avg/min/max) |
| `join` | Query + follow refs + project fields from both sides |
| `create` | Write new record + index + git commit |
| `update` | Modify record + reindex + git commit (frontmatter guarded) |
| `delete` | Remove record (soft/hard) + git commit |
| `bulk_create` | Create multiple records + single git commit |
| `bulk_update` | Update multiple records |
| `validate` | Check record(s) against schema |
| `reindex` | Rebuild index from markdown |
| `reload` | Reload registry + schemas without restart |
| `health` | Engine status, recovery actions, provenance mode |
| `parse` | Parse one file, return structure |
| `history` | Git log for one document |
| `audit` | Git log for project (date-inclusive) |

### Tier 2 — Deterministic Composite

Bundled convenience operations. Multiple internal calls, zero judgment. Exists to reduce LLM tool chatter when the composition pattern is common and the result is always the same.

**Test:** Is it deterministic composition with no reasoning? Does it measurably reduce call count for a common pattern?

Composites are **provisional** until validated by real MCP usage data. They earn their place; they are not assumed.

| Command | Composition | Status |
|---------|-------------|--------|
| `get full` | get hot + related + search + resolve refs | Provisional — evaluate after MCP |

### Tier 3 — Agent Workflow

Multi-step reasoning, cross-document analysis, conditional logic. The LLM orchestrates primitives. These live in skill files, workflow configs, or agent prompts — never in the engine.

**Test:** Does it require judgment, branching, or context-dependent decisions? If yes, the LLM composes it.

**Examples:**
- "Review all open cases and summarize risk" — multi-doc reasoning
- "Inspect a document" — compose: get hot + validate + related + search
- "Onboard this folder of files" — compose: scan dir + propose types + create registry + add frontmatter + reindex
- "Tag all person entities as confidential" — policy application across records

**Composition patterns** are documented in MAAD.md so the LLM knows how to build these from primitives.

## Engine Design Principles

1. **Lean.** Minimal dependencies. No frameworks. Every engine operation should be fast enough that the LLM doesn't notice latency.

2. **Fast.** Synchronous SQLite reads. File reads via line pointers. No hidden reindex or git walks in read paths.

3. **Scalable.** One project, one index, one process. Horizontal scale comes from running multiple instances, not from engine complexity.

4. **Deterministic.** Same input, same output. No inference, no heuristics, no LLM calls inside the engine. The engine is a tool, not a thinker.

5. **Composable.** Primitives are small enough that the LLM can combine them. Convenience composites are provisional and must justify their existence with usage data.

## Adding New Commands

Before adding a command to the engine, apply these criteria:

1. **Single-pass test.** Can it complete in one deterministic operation? If yes, it's a primitive.
2. **Composition test.** Is it a common pattern of 3+ primitives with no judgment? Candidate for provisional composite. Require usage data before promoting.
3. **Judgment test.** Does it require reasoning, branching, or context? Agent workflow. Document the composition pattern. Don't build it into the engine.

When in doubt, leave it out. The LLM can compose. The engine cannot uncommit complexity.

## Offloading Model

The engine handles the fast path. Everything else pushes up.

| Concern | Where it lives |
|---------|---------------|
| Parse, index, CRUD, search, validate | Engine (Tier 1) |
| Common bundled reads | Engine composite (Tier 2, provisional) |
| Multi-step reasoning, analysis, reporting | Agent skill files / prompts (Tier 3) |
| Microsoft 365, email, calendar, APIs | External bridges (separate repos) |
| Workflow rules ("when X, do Y") | Agent layer, not engine |
| Object attributes / tagging policies | Engine when built, applied via engine tools |

The engine is the data layer. The agent is the reasoning layer. They do not cross.
