// ============================================================================
// CLI Helpers — shared utilities for all command modules
// ============================================================================

import path from 'node:path';
import { MaadEngine } from '../engine.js';

export interface CliContext {
  args: string[];
  projectRoot: string;
  __dirname: string;
}

export async function initEngine(ctx: CliContext): Promise<MaadEngine> {
  const engine = new MaadEngine();
  const result = await engine.init(path.resolve(ctx.projectRoot));
  if (!result.ok) {
    console.error('Failed to initialize engine:');
    for (const e of result.errors) console.error(`  ${e.code}: ${e.message}`);
    process.exit(1);
  }
  return engine;
}
