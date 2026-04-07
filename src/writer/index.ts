// ============================================================================
// Document Writer — Public API
// Generates, updates, and serializes markdown documents deterministically.
// ============================================================================

import type { SchemaDefinition } from '../types.js';
import { serializeFrontmatter } from './serializer.js';
import { generateTemplateBody } from './template.js';

export { serializeFrontmatter, serializeField } from './serializer.js';
export { generateTemplateBody } from './template.js';

export function generateDocument(
  frontmatter: Record<string, unknown>,
  schema: SchemaDefinition,
  body?: string | undefined,
): string {
  const fm = serializeFrontmatter(frontmatter, schema);

  // If no body provided, generate from template (if schema defines one)
  const resolvedBody = body ?? generateTemplateBody(schema, frontmatter);

  const parts = [fm, ''];
  if (resolvedBody.length > 0) {
    parts.push(resolvedBody);
    parts.push('');
  }

  return parts.join('\n');
}

export function extractBody(rawContent: string): string {
  const match = /^---\n[\s\S]*?\n---\n?([\s\S]*)$/.exec(rawContent);
  return match ? match[1]!.trim() : rawContent.trim();
}

export function appendToBody(existingContent: string, additional: string): string {
  const fmMatch = /^(---\n[\s\S]*?\n---\n?)([\s\S]*)$/.exec(existingContent);
  if (!fmMatch) return existingContent + '\n\n' + additional;

  const fmPart = fmMatch[1]!;
  const bodyPart = fmMatch[2]!.trimEnd();

  return fmPart + bodyPart + '\n\n' + additional + '\n';
}
