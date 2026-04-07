import { describe, it, expect } from 'vitest';
import { generateTemplateBody } from '../../src/writer/template.js';
import { docType, type SchemaDefinition } from '../../src/types.js';

function makeSchema(headings: Array<{ level: number; text: string; id?: string }>): SchemaDefinition {
  return {
    type: docType('test'),
    version: 1,
    required: ['doc_id'],
    fields: new Map(),
    template: headings.map(h => ({
      level: h.level,
      text: h.text,
      id: h.id ?? null,
    })),
  };
}

describe('generateTemplateBody', () => {
  it('generates heading structure from template', () => {
    const schema = makeSchema([
      { level: 1, text: '{{title}}', id: 'summary' },
      { level: 2, text: 'Details', id: 'details' },
      { level: 2, text: 'Timeline', id: 'timeline' },
    ]);

    const body = generateTemplateBody(schema, { title: 'Contract Review' });

    expect(body).toContain('# Contract Review {#summary}');
    expect(body).toContain('## Details {#details}');
    expect(body).toContain('## Timeline {#timeline}');
  });

  it('resolves {{field}} references in heading text', () => {
    const schema = makeSchema([
      { level: 1, text: '{{name}} - {{status}}' },
    ]);

    const body = generateTemplateBody(schema, { name: 'Acme Corp', status: 'active' });
    expect(body).toContain('# Acme Corp - active');
  });

  it('leaves unresolved fields as key name', () => {
    const schema = makeSchema([
      { level: 1, text: '{{missing_field}}' },
    ]);

    const body = generateTemplateBody(schema, {});
    expect(body).toContain('# missing_field');
  });

  it('returns empty string when no template defined', () => {
    const schema: SchemaDefinition = {
      type: docType('test'),
      version: 1,
      required: ['doc_id'],
      fields: new Map(),
      template: null,
    };

    const body = generateTemplateBody(schema, {});
    expect(body).toBe('');
  });

  it('handles headings without anchors', () => {
    const schema = makeSchema([
      { level: 1, text: 'Title' },
      { level: 2, text: 'Section' },
    ]);

    const body = generateTemplateBody(schema, {});
    expect(body).toContain('# Title');
    expect(body).not.toContain('{#');
    expect(body).toContain('## Section');
  });
});
