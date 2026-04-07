// ============================================================================
// Engine Context — shared state passed to all domain modules
// ============================================================================

import type { Registry, SchemaStore } from '../types.js';
import type { MaadBackend } from '../backend/index.js';
import type { GitLayer, CommitOptions } from '../git/index.js';

export interface EngineContext {
  projectRoot: string;
  registry: Registry;
  schemaStore: SchemaStore;
  backend: MaadBackend;
  gitLayer: GitLayer | null;
}

export async function gitCommit(ctx: EngineContext, opts: CommitOptions): Promise<void> {
  if (!ctx.gitLayer) return;
  try {
    await ctx.gitLayer.commit(opts);
  } catch {
    // Git commit failure is non-fatal — the file write already succeeded
  }
}
