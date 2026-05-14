// ============================================================================
// 0.7.10 — Confirm contract foundation. requireConfirm() helper guards every
// destructive tool against mutation without explicit consent.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { requireConfirm } from '../../src/mcp/guardrails.js';

describe('requireConfirm', () => {
  it('returns null when confirm is literal true', () => {
    expect(requireConfirm({ confirm: true })).toBeNull();
  });

  it.each<[string, unknown]>([
    ['absent', undefined],
    ['false', false],
    ['null', null],
    ['number 1', 1],
    ['string "true"', 'true'],
    ['truthy string', 'yes'],
    ['object', {}],
    ['empty string', ''],
  ])('returns CONFIRM_REQUIRED when confirm is %s', (_label, value) => {
    const result = requireConfirm({ confirm: value });
    expect(result).not.toBeNull();
    expect(result?.code).toBe('CONFIRM_REQUIRED');
    expect(result?.message).toContain('confirm: true');
  });

  it('error shape carries no location or details by default', () => {
    const result = requireConfirm({ confirm: false });
    expect(result?.location).toBeUndefined();
    expect(result?.details).toBeUndefined();
  });
});
