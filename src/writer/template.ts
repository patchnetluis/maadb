// ============================================================================
// Template Generator
// Generates markdown body structure from schema-defined template headings.
// Resolves {{field}} references in heading text.
// ============================================================================

import type { SchemaDefinition, TemplateHeading } from '../types.js';

export function generateTemplateBody(
  schema: SchemaDefinition,
  fields: Record<string, unknown>,
): string {
  if (!schema.template || schema.template.length === 0) return '';

  const sections: string[] = [];

  for (const heading of schema.template) {
    const prefix = '#'.repeat(heading.level);
    const text = resolveFieldRefs(heading.text, fields);
    const anchor = heading.id ? ` {#${heading.id}}` : '';

    sections.push(`${prefix} ${text}${anchor}`);
    sections.push(''); // blank line after heading
  }

  return sections.join('\n').trimEnd();
}

function resolveFieldRefs(text: string, fields: Record<string, unknown>): string {
  return text.replace(/\{\{([a-zA-Z_][a-zA-Z0-9_.]*)\}\}/g, (_, key: string) => {
    const value = fields[key];
    if (value === undefined || value === null) return key;
    return String(value);
  });
}
