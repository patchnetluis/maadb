// ============================================================================
// Discover commands — scan, summary, describe
// ============================================================================

import path from 'node:path';
import { scanFile, scanDirectory } from '../../scanner.js';
import type { CliContext } from '../helpers.js';
import { initEngine } from '../helpers.js';

export async function cmdScan(ctx: CliContext): Promise<void> {
  const target = ctx.args[1];
  if (!target) {
    console.error('Usage: maad scan <file.md|directory>');
    process.exit(1);
  }

  const absTarget = path.resolve(target);
  const { statSync } = await import('node:fs');

  let stat;
  try {
    stat = statSync(absTarget);
  } catch {
    console.error(`Not found: ${absTarget}`);
    process.exit(1);
  }

  if (stat.isFile()) {
    const result = await scanFile(absTarget);
    console.log(JSON.stringify(result, null, 2));
  } else if (stat.isDirectory()) {
    const result = await scanDirectory(absTarget);
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.error('Target must be a file or directory');
    process.exit(1);
  }
}

export async function cmdSummary(ctx: CliContext): Promise<void> {
  const engine = await initEngine(ctx);
  const result = engine.summary();
  console.log(JSON.stringify(result, null, 2));
  engine.close();
}

export async function cmdDescribe(ctx: CliContext): Promise<void> {
  const engine = await initEngine(ctx);
  const desc = engine.describe();
  console.log(JSON.stringify(desc, null, 2));
  engine.close();
}
