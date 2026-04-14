// ============================================================================
// EnginePool tests — lazy init, caching, eviction, empty-project boot
// ============================================================================

import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { EnginePool } from '../../src/instance/pool.js';
import type { InstanceConfig } from '../../src/instance/config.js';

const createdDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'maad-pool-'));
  createdDirs.push(dir);
  return dir;
}

function makeInstance(projects: Array<{ name: string; path: string; role?: 'reader' | 'writer' | 'admin' }>): InstanceConfig {
  return {
    name: 'test-instance',
    projects: projects.map(p => ({ name: p.name, path: p.path, role: p.role ?? 'admin' })),
    source: 'file',
  };
}

afterEach(async () => {
  await new Promise(r => setTimeout(r, 50));
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop()!;
    try { if (existsSync(dir)) rmSync(dir, { recursive: true, force: true }); } catch { /* windows */ }
  }
});

describe('EnginePool', () => {
  it('lazy-inits an engine on first get and caches thereafter', async () => {
    const dir = makeTempDir();
    const pool = new EnginePool(makeInstance([{ name: 'alpha', path: dir }]));
    expect(pool.has('alpha')).toBe(false);

    const first = await pool.get('alpha');
    expect(first.ok).toBe(true);
    expect(pool.has('alpha')).toBe(true);

    const second = await pool.get('alpha');
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.value).toBe(first.value);
    }

    await pool.closeAll();
  });

  it('returns PROJECT_UNKNOWN for names not in the instance', async () => {
    const dir = makeTempDir();
    const pool = new EnginePool(makeInstance([{ name: 'alpha', path: dir }]));
    const result = await pool.get('ghost');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].code).toBe('PROJECT_UNKNOWN');
    await pool.closeAll();
  });

  it('initializes engines independently for multiple projects', async () => {
    const dirA = makeTempDir();
    const dirB = makeTempDir();
    const pool = new EnginePool(makeInstance([
      { name: 'alpha', path: dirA },
      { name: 'beta', path: dirB },
    ]));

    const a = await pool.get('alpha');
    const b = await pool.get('beta');
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.value).not.toBe(b.value);
    }

    await pool.closeAll();
  });

  it('scaffolds _skills/ on first init via empty-project boot', async () => {
    const dir = makeTempDir();
    const pool = new EnginePool(makeInstance([{ name: 'alpha', path: dir }]));

    await pool.get('alpha');
    expect(existsSync(path.join(dir, '_skills', 'architect-core.md'))).toBe(true);
    expect(existsSync(path.join(dir, '_registry', 'object_types.yaml'))).toBe(true);

    await pool.closeAll();
  });

  it('evict closes the engine and removes from cache', async () => {
    const dir = makeTempDir();
    const pool = new EnginePool(makeInstance([{ name: 'alpha', path: dir }]));

    await pool.get('alpha');
    expect(pool.has('alpha')).toBe(true);

    await pool.evict('alpha');
    expect(pool.has('alpha')).toBe(false);
    await pool.closeAll();
  });

  it('evict on a non-cached project is a no-op', async () => {
    const pool = new EnginePool(makeInstance([{ name: 'alpha', path: makeTempDir() }]));
    await expect(pool.evict('alpha')).resolves.toBeUndefined();
    await expect(pool.evict('ghost')).resolves.toBeUndefined();
  });

  it('concurrent gets for the same project share one init', async () => {
    const dir = makeTempDir();
    const pool = new EnginePool(makeInstance([{ name: 'alpha', path: dir }]));

    const [a, b, c] = await Promise.all([pool.get('alpha'), pool.get('alpha'), pool.get('alpha')]);
    expect(a.ok && b.ok && c.ok).toBe(true);
    if (a.ok && b.ok && c.ok) {
      expect(a.value).toBe(b.value);
      expect(b.value).toBe(c.value);
    }
    await pool.closeAll();
  });

  it('listProjects returns a copy of the project list', () => {
    const dir = makeTempDir();
    const pool = new EnginePool(makeInstance([{ name: 'alpha', path: dir }]));
    const list1 = pool.listProjects();
    list1.push({ name: 'hack', path: '/x', role: 'admin' });
    expect(pool.listProjects()).toHaveLength(1);
  });
});
