import { describe, it, expect } from 'vitest';
import { getToolsForRole, parseRole } from '../../src/mcp/roles.js';

describe('MCP roles', () => {
  it('reader gets 10 tools', () => {
    const tools = getToolsForRole('reader');
    expect(tools.size).toBe(10);
    expect(tools.has('maad.summary')).toBe(true);
    expect(tools.has('maad.get')).toBe(true);
    expect(tools.has('maad.create')).toBe(false);
    expect(tools.has('maad.delete')).toBe(false);
  });

  it('writer gets 13 tools (reader + create, update, validate)', () => {
    const tools = getToolsForRole('writer');
    expect(tools.size).toBe(13);
    expect(tools.has('maad.create')).toBe(true);
    expect(tools.has('maad.update')).toBe(true);
    expect(tools.has('maad.validate')).toBe(true);
    expect(tools.has('maad.delete')).toBe(false);
    expect(tools.has('maad.reindex')).toBe(false);
  });

  it('admin gets 15 tools (all)', () => {
    const tools = getToolsForRole('admin');
    expect(tools.size).toBe(15);
    expect(tools.has('maad.delete')).toBe(true);
    expect(tools.has('maad.reindex')).toBe(true);
  });

  it('parseRole defaults to reader for invalid input', () => {
    expect(parseRole(undefined)).toBe('reader');
    expect(parseRole('invalid')).toBe('reader');
    expect(parseRole('')).toBe('reader');
  });

  it('parseRole accepts valid roles', () => {
    expect(parseRole('reader')).toBe('reader');
    expect(parseRole('writer')).toBe('writer');
    expect(parseRole('admin')).toBe('admin');
  });
});
