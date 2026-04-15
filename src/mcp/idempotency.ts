// ============================================================================
// Idempotency Cache — dedupes retried writes per (project, tool, key).
//
// Scope intentionally per-project, not per-session: a client whose connection
// drops mid-retry reconnects with a fresh session ID and re-issues the write.
// Session-scoped cache would miss and create a duplicate. Collision across
// unrelated clients is the client's responsibility (use UUIDs).
//
// Replay returns the original response body byte-for-byte, with a fresh `_meta`
// envelope: { replayed: true, original_request_id, original_completed_at }.
// Clients that ignore `_meta` see a normal successful response.
//
// Bounded: 10-minute TTL, 10k-entry LRU cap. Tunable via env. In-memory only —
// process restart drops the cache; documented behavior.
// ============================================================================

export interface IdempotencyEntry {
  response: unknown;              // original CallToolResult (will be re-wrapped with fresh _meta on replay)
  originalRequestId: string;      // request_id from the first execution
  originalCompletedAt: string;    // ISO timestamp of first completion
  insertedAtMs: number;           // for TTL gating and LRU ordering
}

export interface IdempotencyCacheOptions {
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;             // injectable clock for tests
}

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 10_000;

export class IdempotencyCache {
  private ttlMs: number;
  private maxEntries: number;
  private now: () => number;
  // JS Map preserves insertion order; we exploit that for O(1) LRU:
  // every successful get() reinserts the entry to move it to the tail.
  private entries = new Map<string, IdempotencyEntry>();

  constructor(opts: IdempotencyCacheOptions = {}) {
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = opts.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.now = opts.now ?? (() => Date.now());
  }

  /** Compose the cache key. Always use this — never pass raw strings. */
  static composeKey(projectName: string, toolName: string, clientKey: string): string {
    return `${projectName}\u0000${toolName}\u0000${clientKey}`;
  }

  /**
   * Return a cached entry if present and not expired, else null. Reinserts on
   * hit so recent hits survive eviction.
   */
  get(key: string): IdempotencyEntry | null {
    const entry = this.entries.get(key);
    if (!entry) return null;

    if (this.now() - entry.insertedAtMs > this.ttlMs) {
      this.entries.delete(key);
      return null;
    }

    // Bump recency: delete + reinsert moves to the Map's tail.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry;
  }

  /**
   * Store a response. Evicts the least-recently-used entry if the cap is full.
   * Only call this for successful responses — failures must not short-circuit
   * retries.
   */
  put(key: string, entry: Omit<IdempotencyEntry, 'insertedAtMs'>): void {
    if (this.entries.has(key)) {
      // Refresh existing entry
      this.entries.delete(key);
    }
    this.entries.set(key, { ...entry, insertedAtMs: this.now() });

    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }
  }

  size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}

// ---- Module-level singleton (same pattern as response.ts provenance) --------

let cache: IdempotencyCache = new IdempotencyCache();

/** Replace the singleton cache — called once from server startup with env-derived config. */
export function initIdempotencyCache(opts: IdempotencyCacheOptions): void {
  cache = new IdempotencyCache(opts);
}

/** Access the current singleton. Never returns null. */
export function getIdempotencyCache(): IdempotencyCache {
  return cache;
}

// ---- Config from env --------------------------------------------------------

export function readIdempotencyEnv(): IdempotencyCacheOptions {
  const ttl = process.env.MAAD_IDEMPOTENCY_TTL_MS;
  const max = process.env.MAAD_IDEMPOTENCY_MAX;
  const opts: IdempotencyCacheOptions = {};
  if (ttl && !Number.isNaN(Number(ttl))) opts.ttlMs = Number(ttl);
  if (max && !Number.isNaN(Number(max))) opts.maxEntries = Number(max);
  return opts;
}

// ---- Response-wrapping helpers ---------------------------------------------

export type McpToolResponse = { content: Array<{ type: 'text'; text: string }> };

/**
 * Returns true if the response body (parsed from content[0].text) has
 * `ok: true`. Silent false on parse failure — never cache anything we can't
 * confirm succeeded.
 */
export function isSuccessfulResponse(response: McpToolResponse): boolean {
  const first = response.content[0];
  if (!first || first.type !== 'text') return false;
  try {
    const parsed = JSON.parse(first.text) as { ok?: unknown };
    return parsed.ok === true;
  } catch {
    return false;
  }
}

/**
 * Build a replay response: identical body to the cached original, plus a fresh
 * `_meta` envelope identifying this as a replay. Clients that ignore `_meta`
 * see a normal successful response.
 */
export function buildReplayResponse(
  cached: IdempotencyEntry,
  currentRequestId: string,
): McpToolResponse {
  const original = cached.response as McpToolResponse;
  const first = original.content[0];
  if (!first || first.type !== 'text') return original;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(first.text) as Record<string, unknown>;
  } catch {
    return original;
  }
  parsed._meta = {
    request_id: currentRequestId,
    replayed: true,
    original_request_id: cached.originalRequestId,
    original_completed_at: cached.originalCompletedAt,
  };
  return { content: [{ type: 'text', text: JSON.stringify(parsed) }] };
}

/**
 * Wrapper for mutating tool handlers. If `clientKey` is provided, checks the
 * cache for a prior completed call matching `(projectName, toolName, clientKey)`.
 * On hit: returns the cached response with fresh replay metadata.
 * On miss: runs `fn()`, caches if successful, returns the result.
 *
 * `currentRequestId` is the request ID for this specific call (used both for
 * _meta on replays and as `originalRequestId` when caching a fresh response).
 * H6 will supply a real request ID from the MCP wrapper; for now callers can
 * pass `crypto.randomUUID()` to satisfy the signature.
 */
export async function withIdempotency(
  projectName: string,
  toolName: string,
  clientKey: string | undefined,
  currentRequestId: string,
  fn: () => Promise<McpToolResponse>,
): Promise<McpToolResponse> {
  if (!clientKey) return fn();

  const cacheKey = IdempotencyCache.composeKey(projectName, toolName, clientKey);
  const cached = cache.get(cacheKey);
  if (cached) {
    return buildReplayResponse(cached, currentRequestId);
  }

  const response = await fn();
  if (isSuccessfulResponse(response)) {
    cache.put(cacheKey, {
      response,
      originalRequestId: currentRequestId,
      originalCompletedAt: new Date().toISOString(),
    });
  }
  return response;
}
