import { describe, it, expect, beforeEach } from 'vitest';
import {
  IdempotencyCache,
  withIdempotency,
  initIdempotencyCache,
  getIdempotencyCache,
  isSuccessfulResponse,
  type McpToolResponse,
} from '../../src/mcp/idempotency.js';

// ---- Helpers ---------------------------------------------------------------

function mkResponse(body: Record<string, unknown>): McpToolResponse {
  return { content: [{ type: 'text', text: JSON.stringify(body) }] };
}

function okResponse(data: Record<string, unknown> = {}): McpToolResponse {
  return mkResponse({ ok: true, data });
}

function errorOnlyResponse(): McpToolResponse {
  return mkResponse({ ok: false, errors: [{ code: 'VALIDATION_FAILED', message: 'bad' }] });
}

function parseBody(response: McpToolResponse): Record<string, unknown> {
  const first = response.content[0]!;
  return JSON.parse(first.text) as Record<string, unknown>;
}

// ---- I1 — same key returns cached response ---------------------------------

describe('I1 — same key returns cached response', () => {
  beforeEach(() => initIdempotencyCache({}));

  it('second call with same key replays the first response body', async () => {
    let callCount = 0;
    const handler = async () => {
      callCount++;
      return okResponse({ docId: `cli-${callCount}`, version: 1 });
    };

    const r1 = await withIdempotency('proj-a', 'maad_create', 'key-xyz', 'req-1', handler);
    const r2 = await withIdempotency('proj-a', 'maad_create', 'key-xyz', 'req-2', handler);

    expect(callCount).toBe(1);
    expect(parseBody(r1).data).toEqual({ docId: 'cli-1', version: 1 });
    expect(parseBody(r2).data).toEqual({ docId: 'cli-1', version: 1 });
  });
});

// ---- I2 — different keys produce different writes --------------------------

describe('I2 — different keys produce different writes', () => {
  beforeEach(() => initIdempotencyCache({}));

  it('two distinct keys run the handler twice', async () => {
    let callCount = 0;
    const handler = async () => {
      callCount++;
      return okResponse({ docId: `cli-${callCount}` });
    };

    await withIdempotency('proj-a', 'maad_create', 'key-A', 'req-1', handler);
    await withIdempotency('proj-a', 'maad_create', 'key-B', 'req-2', handler);

    expect(callCount).toBe(2);
  });
});

// ---- I3 — no key = no dedup ------------------------------------------------

describe('I3 — no key = no dedup', () => {
  beforeEach(() => initIdempotencyCache({}));

  it('two calls without idempotencyKey both run', async () => {
    let callCount = 0;
    const handler = async () => {
      callCount++;
      return okResponse();
    };

    await withIdempotency('proj-a', 'maad_create', undefined, 'req-1', handler);
    await withIdempotency('proj-a', 'maad_create', undefined, 'req-2', handler);

    expect(callCount).toBe(2);
    expect(getIdempotencyCache().size()).toBe(0);
  });
});

// ---- I4 — failed write is not cached ---------------------------------------

describe('I4 — failed write is not cached', () => {
  beforeEach(() => initIdempotencyCache({}));

  it('first call fails; same key on second call retries for real', async () => {
    let callCount = 0;
    const handler = async () => {
      callCount++;
      // First call fails, second succeeds
      return callCount === 1 ? errorOnlyResponse() : okResponse({ docId: 'cli-ok' });
    };

    const r1 = await withIdempotency('proj-a', 'maad_create', 'key-retry', 'req-1', handler);
    const r2 = await withIdempotency('proj-a', 'maad_create', 'key-retry', 'req-2', handler);

    expect(callCount).toBe(2);
    expect(parseBody(r1).ok).toBe(false);
    expect(parseBody(r2).ok).toBe(true);
    expect(parseBody(r2).data).toEqual({ docId: 'cli-ok' });

    // Cache now holds the successful second call
    expect(getIdempotencyCache().size()).toBe(1);
  });
});

// ---- I5 — TTL expires ------------------------------------------------------

describe('I5 — TTL expires', () => {
  it('entry expires after ttlMs elapses (mocked clock)', async () => {
    let fakeNow = 1_000_000;
    initIdempotencyCache({ ttlMs: 5_000, now: () => fakeNow });

    let callCount = 0;
    const handler = async () => {
      callCount++;
      return okResponse({ docId: `cli-${callCount}` });
    };

    await withIdempotency('proj-a', 'maad_create', 'key-ttl', 'req-1', handler);
    expect(callCount).toBe(1);

    // Advance 6 seconds — past the 5s TTL
    fakeNow += 6_000;

    const r2 = await withIdempotency('proj-a', 'maad_create', 'key-ttl', 'req-2', handler);
    expect(callCount).toBe(2);
    expect(parseBody(r2).data).toEqual({ docId: 'cli-2' });
  });
});

// ---- I6 — project scoping + session independence ---------------------------

describe('I6 — project scoping', () => {
  beforeEach(() => initIdempotencyCache({}));

  it('same key across two projects runs the handler twice', async () => {
    let callCount = 0;
    const handler = async () => {
      callCount++;
      return okResponse({ project: `p${callCount}` });
    };

    await withIdempotency('proj-a', 'maad_create', 'shared-key', 'req-1', handler);
    await withIdempotency('proj-b', 'maad_create', 'shared-key', 'req-2', handler);

    expect(callCount).toBe(2);
  });

  it('same key within same project replays regardless of request id (proxy for session independence)', async () => {
    let callCount = 0;
    const handler = async () => {
      callCount++;
      return okResponse({ docId: `cli-${callCount}` });
    };

    // Two different request IDs (models reconnect with a new session ID)
    await withIdempotency('proj-a', 'maad_create', 'same-key', 'req-from-session-1', handler);
    const r2 = await withIdempotency('proj-a', 'maad_create', 'same-key', 'req-from-session-2', handler);

    expect(callCount).toBe(1);
    expect(parseBody(r2).data).toEqual({ docId: 'cli-1' });
  });
});

// ---- I6b — replay identifiability ------------------------------------------

describe('I6b — replay identifiability via _meta', () => {
  beforeEach(() => initIdempotencyCache({}));

  it('replay response carries _meta with replayed=true and original ids', async () => {
    const handler = async () => okResponse({ docId: 'cli-identifiable' });

    const r1 = await withIdempotency('proj-a', 'maad_create', 'key-id', 'req-original-abc', handler);
    const r2 = await withIdempotency('proj-a', 'maad_create', 'key-id', 'req-replay-def', handler);

    const body1 = parseBody(r1);
    const body2 = parseBody(r2);

    // Original response has no _meta (not a replay)
    expect(body1._meta).toBeUndefined();

    // Replay has full _meta envelope
    expect(body2._meta).toEqual(
      expect.objectContaining({
        request_id: 'req-replay-def',
        replayed: true,
        original_request_id: 'req-original-abc',
      }),
    );

    const meta = body2._meta as Record<string, unknown>;
    expect(typeof meta.original_completed_at).toBe('string');
    // Validate ISO timestamp
    expect(() => new Date(meta.original_completed_at as string).toISOString()).not.toThrow();

    // Body data is byte-identical
    expect(body2.ok).toBe(true);
    expect(body2.data).toEqual({ docId: 'cli-identifiable' });
  });
});

// ---- I7 — LRU eviction -----------------------------------------------------

describe('I7 — LRU eviction', () => {
  it('evicts the least-recently-used entry when over the cap', async () => {
    initIdempotencyCache({ maxEntries: 3 });
    const cache = getIdempotencyCache();

    const handler = (label: string) => async () => okResponse({ label });

    // Fill cache to capacity
    await withIdempotency('proj-a', 'maad_create', 'k1', 'r1', handler('A'));
    await withIdempotency('proj-a', 'maad_create', 'k2', 'r2', handler('B'));
    await withIdempotency('proj-a', 'maad_create', 'k3', 'r3', handler('C'));
    expect(cache.size()).toBe(3);

    // Insert one more — oldest (k1) should be evicted
    await withIdempotency('proj-a', 'maad_create', 'k4', 'r4', handler('D'));
    expect(cache.size()).toBe(3);

    // k1 is gone: calling it again runs handler fresh
    let ranAgain = false;
    await withIdempotency('proj-a', 'maad_create', 'k1', 'r1-retry', async () => {
      ranAgain = true;
      return okResponse({ label: 'A-redo' });
    });
    expect(ranAgain).toBe(true);
  });
});

// ---- Helper: isSuccessfulResponse ------------------------------------------

describe('isSuccessfulResponse', () => {
  it('returns true for ok:true body', () => {
    expect(isSuccessfulResponse(okResponse())).toBe(true);
  });

  it('returns false for ok:false body', () => {
    expect(isSuccessfulResponse(errorOnlyResponse())).toBe(false);
  });

  it('returns false for malformed content', () => {
    const r: McpToolResponse = { content: [{ type: 'text', text: '{not valid json' }] };
    expect(isSuccessfulResponse(r)).toBe(false);
  });
});

// ---- IdempotencyCache direct unit tests ------------------------------------

describe('IdempotencyCache direct', () => {
  it('composeKey produces distinct keys for distinct tuples', () => {
    const a = IdempotencyCache.composeKey('p', 't', 'k');
    const b = IdempotencyCache.composeKey('p', 't', 'k2');
    const c = IdempotencyCache.composeKey('p2', 't', 'k');
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('get returns null for missing keys', () => {
    const c = new IdempotencyCache();
    expect(c.get('nonexistent')).toBeNull();
  });

  it('put + get roundtrips entry shape', () => {
    const c = new IdempotencyCache();
    const key = IdempotencyCache.composeKey('proj', 'tool', 'k');
    c.put(key, {
      response: { content: [{ type: 'text', text: '{"ok":true,"data":{}}' }] },
      originalRequestId: 'req-original',
      originalCompletedAt: '2026-04-14T23:00:00.000Z',
    });
    const e = c.get(key);
    expect(e).not.toBeNull();
    expect(e!.originalRequestId).toBe('req-original');
    expect(e!.originalCompletedAt).toBe('2026-04-14T23:00:00.000Z');
  });
});
