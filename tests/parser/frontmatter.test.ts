import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '../../src/parser/frontmatter.js';
import { filePath } from '../../src/types.js';

const fp = filePath('test.md');

describe('parseFrontmatter', () => {
  it('extracts YAML frontmatter and body', () => {
    const raw = `---
title: Hello
status: open
---

# Hello

Body here.`;
    const result = parseFrontmatter(raw, fp);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.frontmatter).toEqual({ title: 'Hello', status: 'open' });
    expect(result.value.body.trim()).toBe('# Hello\n\nBody here.');
    expect(result.value.bodyStartLine).toBeGreaterThan(1);
  });

  it('handles file with no frontmatter', () => {
    const raw = '# Just a heading\n\nSome text.';
    const result = parseFrontmatter(raw, fp);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.frontmatter).toEqual({});
    expect(result.value.body).toContain('Just a heading');
  });

  it('handles all scalar types', () => {
    const raw = `---
name: Acme
count: 42
rate: 3.14
active: true
notes: null
---

Body.`;
    const result = parseFrontmatter(raw, fp);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.frontmatter.name).toBe('Acme');
    expect(result.value.frontmatter.count).toBe(42);
    expect(result.value.frontmatter.rate).toBe(3.14);
    expect(result.value.frontmatter.active).toBe(true);
    expect(result.value.frontmatter.notes).toBeNull();
  });

  it('handles arrays in frontmatter', () => {
    const raw = `---
tags: [enterprise, priority]
---

Body.`;
    const result = parseFrontmatter(raw, fp);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.frontmatter.tags).toEqual(['enterprise', 'priority']);
  });

  it('handles empty frontmatter', () => {
    const raw = `---
---

Body only.`;
    const result = parseFrontmatter(raw, fp);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.frontmatter).toEqual({});
  });
});
