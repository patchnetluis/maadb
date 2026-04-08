// ============================================================================
// MCP Lifecycle — startup validation, engine init, shutdown hooks
// Extracted from server.ts to keep server focused on transport.
// ============================================================================

import { existsSync } from 'node:fs';
import path from 'node:path';
import { MaadEngine } from '../engine.js';
import { logger } from '../engine/logger.js';

export interface StartupResult {
  engine: MaadEngine;
  warnings: string[];
}

export async function startupEngine(projectRoot: string): Promise<StartupResult> {
  const resolved = path.resolve(projectRoot);
  const warnings: string[] = [];

  // Validate project exists
  if (!existsSync(resolved)) {
    throw new Error(`Project directory not found: ${resolved}`);
  }

  const registryPath = path.join(resolved, '_registry', 'object_types.yaml');
  if (!existsSync(registryPath)) {
    throw new Error(`No _registry/object_types.yaml found in ${resolved}`);
  }

  // Init engine
  const engine = new MaadEngine();
  const initResult = await engine.init(resolved);
  if (!initResult.ok) {
    const messages = initResult.errors.map(e => `${e.code}: ${e.message}`).join('; ');
    throw new Error(`Engine initialization failed: ${messages}`);
  }

  // Check for recovery actions
  const recovery = engine.getStartupRecovery();
  if (recovery.length > 0) {
    for (const action of recovery) {
      logger.info('lifecycle', 'startup', action);
      warnings.push(action);
    }
  }

  // Log health
  const health = engine.health();
  logger.info('lifecycle', 'startup', `Engine ready: ${health.totalDocuments} docs, ${health.registeredTypes} types, git: ${health.gitAvailable}`);

  return { engine, warnings };
}

export function registerShutdownHooks(engine: MaadEngine, cleanup?: () => Promise<void>): void {
  const shutdown = async () => {
    logger.info('lifecycle', 'shutdown', 'Shutting down...');
    engine.close();
    if (cleanup) await cleanup();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
