// ============================================================================
// Test helper — build a TokenStore with a pre-seeded token.
//
// 0.7.0 HTTP transport requires a TokenStore with ≥1 active token to boot.
// Most tests don't care about auth shape; they just need a functional store
// so startHttpTransport doesn't refuse. This helper writes a tmpdir-backed
// _auth/tokens.yaml, loads it, and hands back { store, plaintext, tmpRoot }.
//
// Tests that DO care about auth shape (http-auth.test.ts) can still use this
// helper and just verify the plaintext/token-record semantics via the store.
// ============================================================================

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TokenStore } from '../../src/auth/token-store.js';
import type { TokenRecord } from '../../src/auth/types.js';
import type { Role } from '../../src/mcp/roles.js';

export interface TokenFixture {
  store: TokenStore;
  tmpRoot: string;
  plaintext: string;
  record: TokenRecord;
  cleanup: () => Promise<void>;
}

export interface FixtureOpts {
  role?: Role;
  projects?: Array<{ name: string; role?: Role }>;
  agentId?: string;
  name?: string;
}

/**
 * Build a TokenStore backed by a temp dir with one token pre-issued.
 * Default: admin role, wildcard projects, no agent identity. Override via opts
 * when the test needs different capabilities.
 */
export async function makeTokenFixture(opts: FixtureOpts = {}): Promise<TokenFixture> {
  const tmpRoot = await mkdtemp(path.join(tmpdir(), 'maad-auth-fixture-'));
  const loaded = await TokenStore.load(tmpRoot);
  if (!loaded.ok) throw new Error(`TokenStore.load: ${loaded.errors.map(e => e.message).join('; ')}`);
  const issueSpec: Parameters<TokenStore['issue']>[0] = {
    role: opts.role ?? 'admin',
    projects: opts.projects ?? [{ name: '*' }],
  };
  if (opts.agentId !== undefined) issueSpec.agentId = opts.agentId;
  if (opts.name !== undefined) issueSpec.name = opts.name;
  const issued = await loaded.value.issue(issueSpec);
  if (!issued.ok) throw new Error(`issue: ${issued.errors.map(e => e.message).join('; ')}`);
  return {
    store: loaded.value,
    tmpRoot,
    plaintext: issued.value.plaintext,
    record: issued.value.record,
    cleanup: async () => { await rm(tmpRoot, { recursive: true, force: true }).catch(() => {}); },
  };
}
