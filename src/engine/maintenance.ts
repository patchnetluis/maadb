// ============================================================================
// Maintenance — validate
// ============================================================================

import { ok, singleErr, type Result } from '../errors.js';
import type { DocId } from '../types.js';
import { validateFrontmatter } from '../schema/index.js';
import type { EngineContext } from './context.js';
import type { ValidationReport } from './types.js';
import { readFrontmatter } from './helpers.js';

export async function validate(ctx: EngineContext, docId?: DocId | undefined): Promise<Result<ValidationReport>> {
  if (docId) {
    const doc = ctx.backend.getDocument(docId);
    if (!doc) return singleErr('FILE_NOT_FOUND', `Document "${docId as string}" not found`);

    const schema = ctx.schemaStore.getSchemaForType(doc.docType);
    if (!schema) return singleErr('SCHEMA_NOT_FOUND', `No schema for type "${doc.docType as string}"`);

    const frontmatter = await readFrontmatter(ctx.projectRoot, doc);
    const result = validateFrontmatter(frontmatter, schema, ctx.registry);
    return ok({
      total: 1,
      valid: result.valid ? 1 : 0,
      invalid: result.valid ? 0 : 1,
      errors: result.valid ? [] : [{ docId, errors: result.errors.map(e => ({ field: e.field, message: e.message })) }],
    });
  }

  const allDocs = ctx.backend.findDocuments({ limit: 100000 });
  const report: ValidationReport = { total: 0, valid: 0, invalid: 0, errors: [] };

  for (const match of allDocs) {
    report.total++;
    const doc = ctx.backend.getDocument(match.docId);
    if (!doc) continue;

    const schema = ctx.schemaStore.getSchemaForType(doc.docType);
    if (!schema) {
      report.invalid++;
      report.errors.push({ docId: doc.docId, errors: [{ field: 'doc_type', message: 'No schema found' }] });
      continue;
    }

    const frontmatter = await readFrontmatter(ctx.projectRoot, doc);
    const result = validateFrontmatter(frontmatter, schema, ctx.registry);
    if (result.valid) {
      report.valid++;
    } else {
      report.invalid++;
      report.errors.push({ docId: doc.docId, errors: result.errors.map(e => ({ field: e.field, message: e.message })) });
    }
  }

  return ok(report);
}
