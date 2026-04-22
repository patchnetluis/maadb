// 0.7.1 — Agent-instruction generator updates. Adds aggregate / join trigger
// rules to MAAD.md and CLAUDE.md so agents reach for the collapsed primitives
// instead of iterating records or chaining query → get → get.
//
// MAAD.md regenerates on every `reindex`, so this propagates automatically to
// every live project post-release. CLAUDE.md is init-only — existing projects
// keep their pre-0.7.1 copy.

import { describe, it, expect } from 'vitest';
import { generateMaadMd } from '../../src/maad-md.js';
import { generateClaudeMd } from '../../src/claude-md.js';
import { docType as toDocType } from '../../src/types.js';

function fakeMaadMdContext() {
  // Minimal stub inputs; the generator doesn't exercise most of these fields
  // for the rule / description block under test.
  return {
    projectRoot: '/tmp/p',
    enginePath: '/tmp/engine/cli.js',
    registry: { types: new Map(), extraction: { subtypes: {} } },
    schemaStore: {
      getSchemaForType: (_: ReturnType<typeof toDocType>) => null,
      getAllSchemas: () => [],
    } as any,
    stats: null,
  };
}

describe('generateMaadMd — 0.7.1 aggregate + join trigger rules', () => {
  const md = generateMaadMd(fakeMaadMdContext() as any);

  it('rule 10 explicitly triggers aggregate for group-by totals', () => {
    expect(md).toMatch(/10\.\s+\*\*Use `aggregate` for group-by totals\*\*/);
    expect(md).toContain("don't iterate records");
  });

  it('rule 11 explicitly triggers join for ref-following', () => {
    expect(md).toMatch(/11\.\s+\*\*Use `join` to follow refs in one call\*\*/);
    expect(md).toContain('query` → `get` → `get');
  });

  it('aggregate row sharpened to push agents away from iteration', () => {
    expect(md).toContain('Use instead of iterating records to compute totals.');
  });

  it('aggregate row mentions multi-hop ref-chain grammar for cross-doctype work', () => {
    expect(md).toContain('a->b->c');
  });

  it('aggregate row mentions between / array-of-ops filters', () => {
    expect(md).toMatch(/between.*array-of-ops/);
  });

  it('join row sharpened to push agents away from query/get chains', () => {
    expect(md).toContain('Use instead of `query` → `get` → `get` chains');
  });
});

describe('generateClaudeMd — 0.7.1 aggregate + join trigger rules', () => {
  const md = generateClaudeMd();

  it('rule 7 pushes agents to aggregate for totals', () => {
    expect(md).toMatch(/7\.\s+Use `maad_aggregate` for group-by totals/);
    expect(md).toContain("don't page through records");
  });

  it('rule 8 pushes agents to join over query/get loops', () => {
    expect(md).toMatch(/8\.\s+Use `maad_join`/);
    expect(md).toContain("don't chain query/get loops");
  });

  it('aggregate description mentions ref-chain support', () => {
    expect(md).toMatch(/multi-hop ref chains/);
  });

  it('aggregate description includes use-instead-of-iterating trigger', () => {
    expect(md).toContain('Use instead of iterating records to compute totals.');
  });

  it('join description sharpened', () => {
    expect(md).toContain('Use instead of `query` → `get` → `get` chains');
  });
});
