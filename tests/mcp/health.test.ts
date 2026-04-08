import { describe, it, expect, afterAll } from 'vitest';
import path from 'node:path';
import { MaadEngine } from '../../src/engine.js';

const FIXTURE_ROOT = path.resolve(__dirname, '../fixtures/simple-crm');

describe('engine health', () => {
  it('returns health report after init', async () => {
    const engine = new MaadEngine();
    const result = await engine.init(FIXTURE_ROOT);
    expect(result.ok).toBe(true);

    const health = engine.health();
    expect(health.initialized).toBe(true);
    expect(health.readOnly).toBe(false);
    expect(health.registeredTypes).toBe(4);
    expect(health.projectRoot).toContain('simple-crm');
    expect(typeof health.gitAvailable).toBe('boolean');
    expect(Array.isArray(health.recoveryActions)).toBe(true);

    engine.close();
  });

  it('blocks writes in read-only mode', async () => {
    const engine = new MaadEngine();
    const result = await engine.init(FIXTURE_ROOT, { readOnly: true });
    expect(result.ok).toBe(true);
    expect(engine.isReadOnly()).toBe(true);

    const createResult = await engine.createDocument(
      'client' as any,
      { name: 'Test' },
    );
    expect(createResult.ok).toBe(false);
    if (!createResult.ok) {
      expect(createResult.errors[0]!.code).toBe('READ_ONLY');
    }

    engine.close();
  });
});
