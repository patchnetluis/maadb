import { describe, it, expect } from 'vitest';
import { validateYamlProfile } from '../../src/parser/yaml-profile.js';
import { filePath } from '../../src/types.js';

const fp = filePath('test.md');

describe('validateYamlProfile', () => {
  it('accepts valid flat frontmatter', () => {
    const fm = { doc_id: 'test-001', name: 'Test', count: 42, active: true, tags: ['a', 'b'] };
    const result = validateYamlProfile(fm, fp);
    expect(result.ok).toBe(true);
  });

  it('accepts shallow nesting (depth 1)', () => {
    const fm = { doc_id: 'test-001', meta: { author: 'Luis', version: 1 } };
    const result = validateYamlProfile(fm, fp);
    expect(result.ok).toBe(true);
  });

  it('rejects deep nesting (depth > 2)', () => {
    const fm = { doc_id: 'test-001', deep: { level1: { level2: { level3: 'too deep' } } } };
    const result = validateYamlProfile(fm, fp);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.code).toBe('YAML_PROFILE_VIOLATION');
    expect(result.errors[0]!.message).toContain('nesting depth');
  });

  it('accepts null values', () => {
    const fm = { doc_id: 'test-001', notes: null };
    const result = validateYamlProfile(fm, fp);
    expect(result.ok).toBe(true);
  });

  it('accepts Date objects (gray-matter parsed)', () => {
    const fm = { doc_id: 'test-001', opened_at: new Date('2026-04-01') };
    const result = validateYamlProfile(fm, fp);
    expect(result.ok).toBe(true);
  });

  it('rejects objects inside arrays at max depth', () => {
    const fm = { doc_id: 'test-001', items: [{ nested: { deep: 'value' } }] };
    const result = validateYamlProfile(fm, fp);
    expect(result.ok).toBe(false);
  });
});

