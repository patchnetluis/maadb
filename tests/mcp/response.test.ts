import { describe, it, expect } from 'vitest';
import { successResponse, errorResponse, resultToResponse } from '../../src/mcp/response.js';
import type { Result } from '../../src/errors.js';

describe('MCP response contract', () => {
  it('successResponse wraps data in standard shape', () => {
    const resp = successResponse({ foo: 'bar' });
    expect(resp.content).toHaveLength(1);
    expect(resp.content[0]!.type).toBe('text');

    const parsed = JSON.parse(resp.content[0]!.text);
    expect(parsed.ok).toBe(true);
    expect(parsed.data).toEqual({ foo: 'bar' });
  });

  it('errorResponse wraps errors in standard shape', () => {
    const resp = errorResponse([{ code: 'FILE_NOT_FOUND', message: 'Not found', details: {} }] as any);
    const parsed = JSON.parse(resp.content[0]!.text);
    expect(parsed.ok).toBe(false);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0].code).toBe('FILE_NOT_FOUND');
  });

  it('resultToResponse handles success Result', () => {
    const result: Result<string> = { ok: true, value: 'hello' };
    const resp = resultToResponse(result);
    const parsed = JSON.parse(resp.content[0]!.text);
    expect(parsed.ok).toBe(true);
    expect(parsed.data).toBe('hello');
  });

  it('resultToResponse handles error Result', () => {
    const result: Result<string> = {
      ok: false,
      errors: [{ code: 'SCHEMA_NOT_FOUND', message: 'No schema', details: {} }],
    };
    const resp = resultToResponse(result);
    const parsed = JSON.parse(resp.content[0]!.text);
    expect(parsed.ok).toBe(false);
    expect(parsed.errors[0].code).toBe('SCHEMA_NOT_FOUND');
  });

  it('response shape is always { ok, data } or { ok, errors }', () => {
    const success = JSON.parse(successResponse(42).content[0]!.text);
    expect(Object.keys(success).sort()).toEqual(['data', 'ok']);

    const error = JSON.parse(errorResponse([{ code: 'X', message: 'Y' }] as any).content[0]!.text);
    expect(Object.keys(error).sort()).toEqual(['errors', 'ok']);
  });
});
