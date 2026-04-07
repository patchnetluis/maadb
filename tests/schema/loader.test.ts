import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadRegistry } from '../../src/registry/loader.js';
import { loadSchemas } from '../../src/schema/loader.js';

const FIXTURE_ROOT = path.resolve(__dirname, '../fixtures/simple-crm');

describe('loadSchemas', () => {
  it('loads all schemas referenced by registry', async () => {
    const regResult = await loadRegistry(FIXTURE_ROOT);
    expect(regResult.ok).toBe(true);
    if (!regResult.ok) return;

    const schemaResult = await loadSchemas(FIXTURE_ROOT, regResult.value);
    expect(schemaResult.ok).toBe(true);
    if (!schemaResult.ok) return;

    const store = schemaResult.value;
    expect(store.schemas.size).toBe(4);
  });

  it('parses case schema fields correctly', async () => {
    const regResult = await loadRegistry(FIXTURE_ROOT);
    if (!regResult.ok) return;

    const schemaResult = await loadSchemas(FIXTURE_ROOT, regResult.value);
    if (!schemaResult.ok) return;

    const caseSchema = schemaResult.value.getSchemaForType('case' as any);
    expect(caseSchema).toBeDefined();
    expect(caseSchema!.required).toContain('title');
    expect(caseSchema!.required).toContain('client');
    expect(caseSchema!.required).toContain('status');

    const statusField = caseSchema!.fields.get('status');
    expect(statusField).toBeDefined();
    expect(statusField!.type).toBe('enum');
    expect(statusField!.values).toEqual(['open', 'pending', 'closed']);
    expect(statusField!.index).toBe(true);
  });

  it('parses ref fields with targets', async () => {
    const regResult = await loadRegistry(FIXTURE_ROOT);
    if (!regResult.ok) return;

    const schemaResult = await loadSchemas(FIXTURE_ROOT, regResult.value);
    if (!schemaResult.ok) return;

    const caseSchema = schemaResult.value.getSchemaForType('case' as any);
    const clientField = caseSchema!.fields.get('client');
    expect(clientField).toBeDefined();
    expect(clientField!.type).toBe('ref');
    expect(clientField!.target).toBe('client');
  });

  it('defaults date format to YYYY-MM-DD', async () => {
    const regResult = await loadRegistry(FIXTURE_ROOT);
    if (!regResult.ok) return;

    const schemaResult = await loadSchemas(FIXTURE_ROOT, regResult.value);
    if (!schemaResult.ok) return;

    const caseSchema = schemaResult.value.getSchemaForType('case' as any);
    const dateField = caseSchema!.fields.get('opened_at');
    expect(dateField!.format).toBe('YYYY-MM-DD');
    expect(dateField!.role).toBe('created_at');
  });

  it('resolves schemas by type', async () => {
    const regResult = await loadRegistry(FIXTURE_ROOT);
    if (!regResult.ok) return;

    const schemaResult = await loadSchemas(FIXTURE_ROOT, regResult.value);
    if (!schemaResult.ok) return;

    const store = schemaResult.value;
    expect(store.getSchemaForType('client' as any)).toBeDefined();
    expect(store.getSchemaForType('nonexistent' as any)).toBeUndefined();
    expect(store.getSchema('client.v1' as any)).toBeDefined();
  });
});
