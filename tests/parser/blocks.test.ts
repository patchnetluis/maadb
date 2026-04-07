import { describe, it, expect } from 'vitest';
import { parseBlocks } from '../../src/parser/blocks.js';

describe('parseBlocks', () => {
  it('splits on ATX headings', () => {
    const body = `# First

Content one.

## Second

Content two.

## Third

Content three.`;
    const blocks = parseBlocks(body, 5);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]!.heading).toBe('First');
    expect(blocks[0]!.level).toBe(1);
    expect(blocks[1]!.heading).toBe('Second');
    expect(blocks[1]!.level).toBe(2);
    expect(blocks[2]!.heading).toBe('Third');
  });

  it('extracts {#custom_id} anchors', () => {
    const body = `# Title {#summary}

Some content.

## Timeline {#timeline}

Events here.`;
    const blocks = parseBlocks(body, 5);
    expect(blocks[0]!.id).toBe('summary');
    expect(blocks[0]!.heading).toBe('Title');
    expect(blocks[1]!.id).toBe('timeline');
    expect(blocks[1]!.heading).toBe('Timeline');
  });

  it('auto-generates slug IDs when no anchor', () => {
    const body = `# My Cool Heading

Content.`;
    const blocks = parseBlocks(body, 5);
    expect(blocks[0]!.id).toBe('my-cool-heading');
  });

  it('creates preamble block for content before first heading', () => {
    const body = `Some intro text.

More intro.

# First Heading

Content.`;
    const blocks = parseBlocks(body, 5);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.id).toBeNull();
    expect(blocks[0]!.heading).toBe('');
    expect(blocks[0]!.content).toContain('Some intro text.');
    expect(blocks[1]!.heading).toBe('First Heading');
  });

  it('does not treat # inside fenced code as heading', () => {
    const body = `# Real Heading

\`\`\`
# This is NOT a heading
## Neither is this
\`\`\`

Still part of Real Heading.`;
    const blocks = parseBlocks(body, 5);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.heading).toBe('Real Heading');
  });

  it('handles empty body', () => {
    const blocks = parseBlocks('', 5);
    expect(blocks).toHaveLength(0);
  });

  it('handles body with only whitespace before heading', () => {
    const body = `\n\n# Heading\n\nContent.`;
    const blocks = parseBlocks(body, 5);
    // May or may not have empty preamble depending on trim
    const headingBlock = blocks.find(b => b.heading === 'Heading');
    expect(headingBlock).toBeDefined();
  });
});
