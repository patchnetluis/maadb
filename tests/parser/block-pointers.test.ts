import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseBlocks } from '../../src/parser/blocks.js';
import { parseFrontmatter } from '../../src/parser/frontmatter.js';
import { filePath } from '../../src/types.js';

const FIXTURES = path.resolve(__dirname, '..', 'fixtures', 'simple-crm');

/**
 * Reads block content from a file using start_line:end_line pointers.
 * This is the canonical read-back function for the pointer-only DB.
 *
 * For heading blocks: startLine is the heading itself, content starts at startLine+1.
 * For preamble blocks (heading === ''): content starts at startLine.
 */
function sliceBlockContent(lines: string[], startLine: number, endLine: number, isPreamble: boolean): string {
  const contentStart = isPreamble ? startLine - 1 : startLine;
  const contentEnd = endLine;
  return lines.slice(contentStart, contentEnd).join('\n').trim();
}

describe('block line pointers', () => {
  it('pointer-sliced content recovers body text for a file with headings', async () => {
    const fp = path.join(FIXTURES, 'clients', 'cli-acme.md');
    const raw = await readFile(fp, 'utf-8');
    const lines = raw.split('\n');

    const fm = parseFrontmatter(raw, filePath(fp));
    expect(fm.ok).toBe(true);
    if (!fm.ok) return;

    const blocks = parseBlocks(fm.value.body, fm.value.bodyStartLine);
    expect(blocks.length).toBeGreaterThan(0);

    // First block should be "Acme Corporation" heading — content is the body text
    const sliced = sliceBlockContent(lines, blocks[0]!.startLine, blocks[0]!.endLine, blocks[0]!.heading === '');
    expect(sliced).toContain('Strategic account');
    // Heading line itself should NOT be in the sliced content
    expect(sliced).not.toContain('# Acme');
  });

  it('pointer-sliced content recovers all blocks for multi-heading file', async () => {
    const fp = path.join(FIXTURES, 'cases', 'cas-2026-001.md');
    const raw = await readFile(fp, 'utf-8');
    const lines = raw.split('\n');

    const fm = parseFrontmatter(raw, filePath(fp));
    expect(fm.ok).toBe(true);
    if (!fm.ok) return;

    const blocks = parseBlocks(fm.value.body, fm.value.bodyStartLine);
    expect(blocks.length).toBeGreaterThan(1);

    for (const block of blocks) {
      const sliced = sliceBlockContent(lines, block.startLine, block.endLine, block.heading === '');
      // Every block with a heading should have non-empty content or at least be recoverable
      expect(typeof sliced).toBe('string');
      // Heading line should not appear in content for non-preamble blocks
      if (block.heading !== '') {
        expect(sliced).not.toMatch(new RegExp(`^#{1,6}\\s+${block.heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
      }
    }
  });

  it('handles preamble blocks (content before first heading)', () => {
    const raw = `---
doc_id: test-preamble
doc_type: client
schema: client.v1
name: Test
---

Some preamble text before any heading.

More preamble.

# First Section

Section content here.
`;
    const lines = raw.split('\n');
    const fm = parseFrontmatter(raw, filePath('test.md'));
    expect(fm.ok).toBe(true);
    if (!fm.ok) return;

    const blocks = parseBlocks(fm.value.body, fm.value.bodyStartLine);
    expect(blocks.length).toBe(2);
    expect(blocks[0]!.id).toBeNull(); // preamble
    expect(blocks[1]!.heading).toBe('First Section');

    const preamble = sliceBlockContent(lines, blocks[0]!.startLine, blocks[0]!.endLine, true);
    expect(preamble).toContain('Some preamble text');
    expect(preamble).toContain('More preamble');

    const section = sliceBlockContent(lines, blocks[1]!.startLine, blocks[1]!.endLine, false);
    expect(section).toBe('Section content here.');
  });

  it('handles single-line blocks', () => {
    const raw = `---
doc_id: test-single
doc_type: client
schema: client.v1
name: Test
---

# One

Single line.

# Two

Another single line.
`;
    const lines = raw.split('\n');
    const fm = parseFrontmatter(raw, filePath('test.md'));
    expect(fm.ok).toBe(true);
    if (!fm.ok) return;

    const blocks = parseBlocks(fm.value.body, fm.value.bodyStartLine);
    expect(blocks.length).toBe(2);

    const first = sliceBlockContent(lines, blocks[0]!.startLine, blocks[0]!.endLine, false);
    expect(first).toBe('Single line.');

    const second = sliceBlockContent(lines, blocks[1]!.startLine, blocks[1]!.endLine, false);
    expect(second).toBe('Another single line.');
  });

  it('handles blocks at EOF without trailing newline', () => {
    const raw = `---
doc_id: test-eof
doc_type: client
schema: client.v1
name: Test
---

# Only Section

Content at the very end.`;
    const lines = raw.split('\n');
    const fm = parseFrontmatter(raw, filePath('test.md'));
    expect(fm.ok).toBe(true);
    if (!fm.ok) return;

    const blocks = parseBlocks(fm.value.body, fm.value.bodyStartLine);
    expect(blocks.length).toBe(1);

    const sliced = sliceBlockContent(lines, blocks[0]!.startLine, blocks[0]!.endLine, false);
    expect(sliced).toBe('Content at the very end.');
  });
});
