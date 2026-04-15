// ============================================================================
// 0.4.1 H8 — maad_health extensions
// Tests the new fields: lastWriteAt, repoSizeBytes, gitClean, diskHeadroomMb.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { existsSync, rmSync, cpSync, writeFileSync } from 'node:fs';
import { simpleGit } from 'simple-git';
import { MaadEngine } from '../../src/engine.js';
import { docType as toDocType } from '../../src/types.js';

const FIXTURE_SRC = path.resolve(__dirname, '../fixtures/simple-crm');

async function makeEngine(label: string): Promise<{ engine: MaadEngine; root: string }> {
  const root = path.resolve(__dirname, `../fixtures/_temp-health-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  if (existsSync(root)) rmSync(root, { recursive: true });
  cpSync(FIXTURE_SRC, root, { recursive: true });
  const backendDir = path.join(root, '_backend');
  if (existsSync(backendDir)) rmSync(backendDir, { recursive: true });

  const git = simpleGit(root);
  await git.init();
  await git.addConfig('user.email', 'test@test.com');
  await git.addConfig('user.name', 'Test');
  // Engine scratch dirs must be excluded or git-status will always flag them.
  writeFileSync(path.join(root, '.gitignore'), '_backend/\n', 'utf8');
  await git.add('.');
  await git.commit('Initial commit');

  const engine = new MaadEngine();
  const result = await engine.init(root);
  expect(result.ok).toBe(true);
  await engine.indexAll({ force: true });
  return { engine, root };
}

async function cleanup(engine: MaadEngine, root: string): Promise<void> {
  engine.close();
  await new Promise((r) => setTimeout(r, 100));
  try {
    if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  } catch {
    // windows — non-fatal
  }
}

describe('HealthReport extensions', () => {
  let engine: MaadEngine;
  let root: string;
  beforeEach(async () => ({ engine, root } = await makeEngine('base')));
  afterEach(async () => cleanup(engine, root));

  it('lastWriteAt updates on each mutating op', async () => {
    // indexAll from makeEngine already set it; capture and compare.
    const before = engine.health().lastWriteAt;
    expect(before).not.toBeNull();

    // Ensure a measurable gap (ISO precision is ms)
    await new Promise((r) => setTimeout(r, 10));

    const result = await engine.createDocument(
      toDocType('client'),
      { name: 'Health-A', status: 'active' },
      undefined,
      'cli-health-a',
    );
    expect(result.ok).toBe(true);

    const after = engine.health().lastWriteAt;
    expect(after).not.toBeNull();
    expect(new Date(after!).getTime()).toBeGreaterThan(new Date(before!).getTime());
  });

  it('lastWriteAt is null on a fresh engine with no writes', async () => {
    // Make a fresh engine that DOES NOT run indexAll (makeEngine does).
    const freshRoot = path.resolve(__dirname, `../fixtures/_temp-health-fresh-${Date.now()}`);
    if (existsSync(freshRoot)) rmSync(freshRoot, { recursive: true });
    cpSync(FIXTURE_SRC, freshRoot, { recursive: true });
    const backendDir = path.join(freshRoot, '_backend');
    if (existsSync(backendDir)) rmSync(backendDir, { recursive: true });

    const git = simpleGit(freshRoot);
    await git.init();
    await git.addConfig('user.email', 'test@test.com');
    await git.addConfig('user.name', 'Test');
    writeFileSync(path.join(freshRoot, '.gitignore'), '_backend/\n', 'utf8');
    await git.add('.');
    await git.commit('Initial commit');

    const fresh = new MaadEngine();
    const initResult = await fresh.init(freshRoot);
    expect(initResult.ok).toBe(true);

    expect(fresh.health().lastWriteAt).toBeNull();

    await cleanup(fresh, freshRoot);
  });

  it('repoSizeBytes is a positive number when git is available', () => {
    const h = engine.health();
    expect(h.repoSizeBytes).not.toBeNull();
    expect(typeof h.repoSizeBytes).toBe('number');
    expect(h.repoSizeBytes!).toBeGreaterThan(0);
  });

  it('repoSizeBytes is cached (second call returns without re-walking)', () => {
    const first = engine.health().repoSizeBytes;
    // Call many times in quick succession; result should be stable.
    for (let i = 0; i < 20; i++) {
      expect(engine.health().repoSizeBytes).toBe(first);
    }
  });

  it('gitClean reports true on a clean working tree', async () => {
    // init() warmed the cache asynchronously — give it a tick.
    await engine.refreshGitClean();
    expect(engine.health().gitClean).toBe(true);
  });

  it('gitClean reports false after an unstaged modification', async () => {
    // Touch a fixture file outside the engine's write path.
    const strayPath = path.join(root, 'stray.txt');
    writeFileSync(strayPath, 'unstaged change\n', 'utf8');
    await engine.refreshGitClean();
    expect(engine.health().gitClean).toBe(false);
  });

  it('diskHeadroomMb is a positive number on any supported filesystem', () => {
    const h = engine.health();
    expect(h.diskHeadroomMb).not.toBeNull();
    expect(typeof h.diskHeadroomMb).toBe('number');
    expect(h.diskHeadroomMb!).toBeGreaterThan(0);
  });

  it('all extended fields are null-safe on init + first health call', () => {
    // Even before refreshGitClean completes, the report must be structurally valid.
    const h = engine.health();
    expect(h).toHaveProperty('lastWriteAt');
    expect(h).toHaveProperty('repoSizeBytes');
    expect(h).toHaveProperty('gitClean');
    expect(h).toHaveProperty('diskHeadroomMb');
  });
});

describe('HealthReport extensions — no-git project', () => {
  it('repoSizeBytes and gitClean are null when git is unavailable', async () => {
    // Create a temp project WITHOUT git init
    const root = path.resolve(__dirname, `../fixtures/_temp-health-nogit-${Date.now()}`);
    if (existsSync(root)) rmSync(root, { recursive: true });
    cpSync(FIXTURE_SRC, root, { recursive: true });
    const backendDir = path.join(root, '_backend');
    if (existsSync(backendDir)) rmSync(backendDir, { recursive: true });
    // Also remove any .git that may have been copied from the fixture
    const gitDir = path.join(root, '.git');
    if (existsSync(gitDir)) rmSync(gitDir, { recursive: true, force: true });

    const engine = new MaadEngine();
    const result = await engine.init(root);
    expect(result.ok).toBe(true);

    const h = engine.health();
    expect(h.gitAvailable).toBe(false);
    expect(h.repoSizeBytes).toBeNull();
    expect(h.gitClean).toBeNull();
    // Disk headroom should still work — it probes the filesystem, not git
    expect(h.diskHeadroomMb).not.toBeNull();

    await cleanup(engine, root);
  });
});
