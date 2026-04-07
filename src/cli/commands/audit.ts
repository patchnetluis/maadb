// ============================================================================
// Audit commands — history, audit
// ============================================================================

import { docId } from '../../types.js';
import type { CliContext } from '../helpers.js';
import { initEngine } from '../helpers.js';

export async function cmdHistory(ctx: CliContext): Promise<void> {
  const id = ctx.args[1];
  if (!id) {
    console.error('Usage: maad history <doc_id>');
    process.exit(1);
  }

  const engine = await initEngine(ctx);

  const result = await engine.history(docId(id));
  if (!result.ok) {
    console.error('History failed:');
    for (const e of result.errors) console.error(`  ${e.code}: ${e.message}`);
    engine.close();
    process.exit(1);
  }

  console.log(JSON.stringify(result.value, null, 2));
  engine.close();
}

export async function cmdAudit(ctx: CliContext): Promise<void> {
  const sinceIdx = ctx.args.indexOf('--since');
  const since = sinceIdx >= 0 ? ctx.args[sinceIdx + 1] : undefined;

  const engine = await initEngine(ctx);

  const result = await engine.audit(since ? { since } : {});
  if (!result.ok) {
    console.error('Audit failed:');
    for (const e of result.errors) console.error(`  ${e.code}: ${e.message}`);
    engine.close();
    process.exit(1);
  }

  console.log(JSON.stringify(result.value, null, 2));
  engine.close();
}
