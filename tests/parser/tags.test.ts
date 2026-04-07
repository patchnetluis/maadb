import { describe, it, expect } from 'vitest';
import { extractValueCalls } from '../../src/parser/tags.js';
import { findVerbatimZones } from '../../src/parser/verbatim.js';
import { filePath } from '../../src/types.js';

const fp = filePath('test.md');

describe('extractValueCalls', () => {
  it('extracts {{field}} references', () => {
    const body = 'Status: {{status}}\nClient: {{client_name}}';
    const zones = findVerbatimZones(body, 5);
    const calls = extractValueCalls(body, 5, fp, zones);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.field).toBe('status');
    expect(calls[1]!.field).toBe('client_name');
  });

  it('extracts dotted field paths', () => {
    const body = 'Contact: {{client.contact.name}}';
    const zones = findVerbatimZones(body, 5);
    const calls = extractValueCalls(body, 5, fp, zones);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.field).toBe('client.contact.name');
  });

  it('skips {{}} inside fenced code blocks', () => {
    const body = `Some text {{real_field}}.

\`\`\`
This has {{not_a_field}} inside code.
\`\`\`

More text {{another_field}}.`;
    const zones = findVerbatimZones(body, 5);
    const calls = extractValueCalls(body, 5, fp, zones);
    expect(calls).toHaveLength(2);
    expect(calls.map(c => c.field)).toEqual(['real_field', 'another_field']);
  });

  it('skips {{}} inside inline code spans', () => {
    const body = 'Use `{{template}}` syntax for templates. Real: {{status}}.';
    const zones = findVerbatimZones(body, 5);
    const calls = extractValueCalls(body, 5, fp, zones);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.field).toBe('status');
  });

  it('handles multiple on same line', () => {
    const body = 'Teams: {{home_team}} vs {{away_team}}';
    const zones = findVerbatimZones(body, 5);
    const calls = extractValueCalls(body, 5, fp, zones);
    expect(calls).toHaveLength(2);
  });

  it('returns empty for no matches', () => {
    const body = 'No value calls here.';
    const zones = findVerbatimZones(body, 5);
    const calls = extractValueCalls(body, 5, fp, zones);
    expect(calls).toHaveLength(0);
  });
});
