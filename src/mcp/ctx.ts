// ============================================================================
// InstanceCtx — the runtime context threaded through every tool handler.
// Holds pool + sessions so `withEngine` can resolve the correct engine
// per call.
// ============================================================================

import type { EnginePool } from '../instance/pool.js';
import type { SessionRegistry } from '../instance/session.js';
import type { InstanceConfig } from '../instance/config.js';

export interface InstanceCtx {
  instance: InstanceConfig;
  pool: EnginePool;
  sessions: SessionRegistry;
}
