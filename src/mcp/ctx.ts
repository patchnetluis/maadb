// ============================================================================
// InstanceCtx — the runtime context threaded through every tool handler.
// Holds pool + sessions so `withEngine` can resolve the correct engine
// per call.
// ============================================================================

import type { EnginePool } from '../instance/pool.js';
import type { SessionRegistry } from '../instance/session.js';
import type { InstanceConfig } from '../instance/config.js';
import type { TokenStore } from '../auth/token-store.js';

export interface InstanceCtx {
  instance: InstanceConfig;
  pool: EnginePool;
  sessions: SessionRegistry;
  /**
   * 0.7.0 — Token registry. Populated in HTTP mode from
   * `<instance-root>/_auth/tokens.yaml`. Null in stdio / synthetic mode
   * (no bearer channel). Callers that only apply when a token is present
   * (auth middleware, identity propagation) check for null.
   */
  tokens: TokenStore | null;
}
