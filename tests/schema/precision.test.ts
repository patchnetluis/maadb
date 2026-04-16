import { describe, it, expect } from 'vitest';
import {
  detectPrecision,
  comparePrecision,
  isCoarserThan,
  isPrecision,
  type Precision,
} from '../../src/schema/precision.js';

describe('detectPrecision', () => {
  // T14 from spec
  it('detects year precision from YYYY', () => {
    expect(detectPrecision('2026')).toBe('year');
  });

  it('detects month precision from YYYY-MM', () => {
    expect(detectPrecision('2026-04')).toBe('month');
  });

  it('detects day precision from YYYY-MM-DD', () => {
    expect(detectPrecision('2026-04-16')).toBe('day');
  });

  it('detects hour precision from YYYY-MM-DDTHH', () => {
    expect(detectPrecision('2026-04-16T17')).toBe('hour');
  });

  it('detects minute precision from YYYY-MM-DDTHH:MM', () => {
    expect(detectPrecision('2026-04-16T17:20')).toBe('minute');
  });

  it('detects second precision from YYYY-MM-DDTHH:MM:SS', () => {
    expect(detectPrecision('2026-04-16T17:20:00')).toBe('second');
  });

  it('detects millisecond precision from YYYY-MM-DDTHH:MM:SS.sss', () => {
    expect(detectPrecision('2026-04-16T17:20:00.000')).toBe('millisecond');
  });

  it('accepts fractional seconds of any length as millisecond', () => {
    expect(detectPrecision('2026-04-16T17:20:00.1')).toBe('millisecond');
    expect(detectPrecision('2026-04-16T17:20:00.123456')).toBe('millisecond');
    expect(detectPrecision('2026-04-16T17:20:00.123456789')).toBe('millisecond');
  });

  // T13 from spec — the load-bearing rule: literal-string precision, not Date semantics
  it('detects 2026-04-16T00:00:00Z as second (not day-padded)', () => {
    expect(detectPrecision('2026-04-16T00:00:00Z')).toBe('second');
  });

  it('strips trailing Z without changing detected precision', () => {
    expect(detectPrecision('2026-04-16T17:20:00Z')).toBe('second');
    expect(detectPrecision('2026-04-16T17:20:00.000Z')).toBe('millisecond');
    expect(detectPrecision('2026-04-16T17:20Z')).toBe('minute');
    expect(detectPrecision('2026-04-16T17Z')).toBe('hour');
  });

  it('strips positive timezone offset without changing precision', () => {
    expect(detectPrecision('2026-04-16T17:20:00+02:00')).toBe('second');
    expect(detectPrecision('2026-04-16T17:20:00.500+09:30')).toBe('millisecond');
    expect(detectPrecision('2026-04-16T17:20+05:30')).toBe('minute');
  });

  it('strips negative timezone offset without changing precision', () => {
    expect(detectPrecision('2026-04-16T17:20:00-05:00')).toBe('second');
    expect(detectPrecision('2026-04-16T17:20:00.500-08:00')).toBe('millisecond');
  });

  it('returns null on malformed input', () => {
    expect(detectPrecision('')).toBeNull();
    expect(detectPrecision('not-a-date')).toBeNull();
    expect(detectPrecision('2026/04/16')).toBeNull();
    expect(detectPrecision('April 16, 2026')).toBeNull();
    expect(detectPrecision('26-04-16')).toBeNull();
    expect(detectPrecision('2026-4-16')).toBeNull(); // month/day must be zero-padded
  });

  it('returns null on partial / truncated ISO forms', () => {
    expect(detectPrecision('2026-04-16T')).toBeNull();
    expect(detectPrecision('2026-04-16T17:')).toBeNull();
    expect(detectPrecision('2026-04-16T17:20:')).toBeNull();
    expect(detectPrecision('2026-04-16T17:20:00.')).toBeNull();
  });
});

describe('comparePrecision', () => {
  it('returns 0 for equal precisions', () => {
    expect(comparePrecision('day', 'day')).toBe(0);
    expect(comparePrecision('second', 'second')).toBe(0);
    expect(comparePrecision('year', 'year')).toBe(0);
  });

  it('returns -1 when first is coarser', () => {
    expect(comparePrecision('day', 'second')).toBe(-1);
    expect(comparePrecision('year', 'month')).toBe(-1);
    expect(comparePrecision('minute', 'millisecond')).toBe(-1);
  });

  it('returns 1 when first is finer', () => {
    expect(comparePrecision('second', 'day')).toBe(1);
    expect(comparePrecision('month', 'year')).toBe(1);
    expect(comparePrecision('millisecond', 'minute')).toBe(1);
  });

  it('orders all seven precisions monotonically', () => {
    const order: Precision[] = ['year', 'month', 'day', 'hour', 'minute', 'second', 'millisecond'];
    for (let i = 0; i < order.length - 1; i++) {
      expect(comparePrecision(order[i]!, order[i + 1]!)).toBe(-1);
      expect(comparePrecision(order[i + 1]!, order[i]!)).toBe(1);
    }
  });
});

describe('isCoarserThan', () => {
  it('returns true when actual is coarser than declared', () => {
    expect(isCoarserThan('day', 'second')).toBe(true);
    expect(isCoarserThan('year', 'month')).toBe(true);
    expect(isCoarserThan('minute', 'millisecond')).toBe(true);
  });

  it('returns false when actual equals declared', () => {
    expect(isCoarserThan('day', 'day')).toBe(false);
    expect(isCoarserThan('second', 'second')).toBe(false);
  });

  it('returns false when actual is finer than declared (storage wins)', () => {
    expect(isCoarserThan('second', 'day')).toBe(false);
    expect(isCoarserThan('millisecond', 'minute')).toBe(false);
    expect(isCoarserThan('month', 'year')).toBe(false);
  });
});

describe('isPrecision', () => {
  it('accepts all seven precision labels', () => {
    expect(isPrecision('year')).toBe(true);
    expect(isPrecision('month')).toBe(true);
    expect(isPrecision('day')).toBe(true);
    expect(isPrecision('hour')).toBe(true);
    expect(isPrecision('minute')).toBe(true);
    expect(isPrecision('second')).toBe(true);
    expect(isPrecision('millisecond')).toBe(true);
  });

  it('rejects unknown strings, non-strings, and typos', () => {
    expect(isPrecision('seconds')).toBe(false);
    expect(isPrecision('Day')).toBe(false);
    expect(isPrecision('')).toBe(false);
    expect(isPrecision(null)).toBe(false);
    expect(isPrecision(undefined)).toBe(false);
    expect(isPrecision(5)).toBe(false);
    expect(isPrecision({})).toBe(false);
  });
});
