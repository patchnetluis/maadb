import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadRegistry } from '../../src/registry/loader.js';

const FIXTURE_ROOT = path.resolve(__dirname, '../fixtures/simple-crm');

describe('loadRegistry', () => {
  it('loads a valid registry', async () => {
    const result = await loadRegistry(FIXTURE_ROOT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const reg = result.value;
    expect(reg.types.size).toBe(4);
    expect(reg.types.has('client' as any)).toBe(true);
    expect(reg.types.has('contact' as any)).toBe(true);
    expect(reg.types.has('case' as any)).toBe(true);
    expect(reg.types.has('case_note' as any)).toBe(true);
  });

  it('parses type properties correctly', async () => {
    const result = await loadRegistry(FIXTURE_ROOT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const client = result.value.types.get('client' as any)!;
    expect(client.path).toBe('clients/');
    expect(client.idPrefix).toBe('cli');
    expect(client.schemaRef).toBe('client.v1');
  });

  it('merges project extraction subtypes', async () => {
    const result = await loadRegistry(FIXTURE_ROOT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // vehicle and officer are defined in the fixture's extraction.subtypes
    expect(result.value.subtypeMap['vehicle']).toBe('entity');
    expect(result.value.subtypeMap['officer']).toBe('entity');
    // defaults still present
    expect(result.value.subtypeMap['person']).toBe('entity');
    expect(result.value.subtypeMap['date']).toBe('date');
  });

  it('returns error for missing registry file', async () => {
    const result = await loadRegistry('/nonexistent/path');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.code).toBe('REGISTRY_NOT_FOUND');
  });
});
