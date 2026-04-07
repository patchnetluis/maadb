// ============================================================================
// Write commands — create, update
// ============================================================================

import { docId, docType } from '../../types.js';
import type { CliContext } from '../helpers.js';
import { initEngine } from '../helpers.js';

export async function cmdCreate(ctx: CliContext): Promise<void> {
  const typeArg = ctx.args[1];
  if (!typeArg) {
    console.error('Usage: maad create <doc_type> --field key=value [--body "text"] [--id custom-id]');
    process.exit(1);
  }

  const engine = await initEngine(ctx);
  await engine.indexAll();

  const fields: Record<string, unknown> = {};
  let body: string | undefined;
  let customId: string | undefined;

  for (let i = 2; i < ctx.args.length; i++) {
    const arg = ctx.args[i]!;
    const next = ctx.args[i + 1];
    if (arg === '--field' && next) {
      const eqIdx = next.indexOf('=');
      if (eqIdx > 0) {
        const key = next.slice(0, eqIdx);
        let val: unknown = next.slice(eqIdx + 1);
        if (typeof val === 'string' && val.startsWith('[') && val.endsWith(']')) {
          val = val.slice(1, -1).split(',').map(s => s.trim());
        }
        fields[key] = val;
      }
      i++;
    } else if (arg === '--body' && next) {
      body = next;
      i++;
    } else if (arg === '--id' && next) {
      customId = next;
      i++;
    }
  }

  const result = await engine.createDocument(docType(typeArg), fields, body, customId);
  if (!result.ok) {
    console.error('Create failed:');
    for (const e of result.errors) console.error(`  ${e.code}: ${e.message}`);
    engine.close();
    process.exit(1);
  }

  console.log(JSON.stringify(result.value, null, 2));
  engine.close();
}

export async function cmdUpdate(ctx: CliContext): Promise<void> {
  const id = ctx.args[1];
  if (!id) {
    console.error('Usage: maad update <doc_id> --field key=value [--body "text"] [--append "text"]');
    process.exit(1);
  }

  const engine = await initEngine(ctx);
  await engine.indexAll();

  const fields: Record<string, unknown> = {};
  let body: string | undefined;
  let appendBody: string | undefined;

  for (let i = 2; i < ctx.args.length; i++) {
    const arg = ctx.args[i]!;
    const next = ctx.args[i + 1];
    if (arg === '--field' && next) {
      const eqIdx = next.indexOf('=');
      if (eqIdx > 0) {
        const key = next.slice(0, eqIdx);
        let val: unknown = next.slice(eqIdx + 1);
        if (typeof val === 'string' && val.startsWith('[') && val.endsWith(']')) {
          val = val.slice(1, -1).split(',').map(s => s.trim());
        }
        fields[key] = val;
      }
      i++;
    } else if (arg === '--body' && next) {
      body = next;
      i++;
    } else if (arg === '--append' && next) {
      appendBody = next;
      i++;
    }
  }

  const hasFields = Object.keys(fields).length > 0;
  const result = await engine.updateDocument(
    docId(id),
    hasFields ? fields : undefined,
    body,
    appendBody,
  );

  if (!result.ok) {
    console.error('Update failed:');
    for (const e of result.errors) console.error(`  ${e.code}: ${e.message}`);
    engine.close();
    process.exit(1);
  }

  console.log(JSON.stringify(result.value, null, 2));
  engine.close();
}
