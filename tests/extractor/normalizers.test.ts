import { describe, it, expect } from 'vitest';
import {
  normalizeDate,
  normalizeDuration,
  normalizeAmount,
  normalizeMeasure,
  normalizeQuantity,
  normalizePercentage,
  normalizeContact,
  normalizeMedia,
  normalizeString,
} from '../../src/extractor/normalizers.js';

describe('normalizeDate', () => {
  it('passes through ISO dates', () => {
    expect(normalizeDate('2026-03-28')).toBe('2026-03-28');
    expect(normalizeDate('2026-03-28T14:30:00Z')).toBe('2026-03-28T14:30:00Z');
  });

  it('parses "Month DD, YYYY"', () => {
    expect(normalizeDate('March 28, 2026')).toBe('2026-03-28');
    expect(normalizeDate('January 5, 2025')).toBe('2025-01-05');
  });

  it('parses short month names', () => {
    expect(normalizeDate('Mar 28, 2026')).toBe('2026-03-28');
    expect(normalizeDate('Jan 5, 2025')).toBe('2025-01-05');
  });

  it('parses "DD Month YYYY"', () => {
    expect(normalizeDate('28 March 2026')).toBe('2026-03-28');
  });

  it('parses "M-DD-YY" US short', () => {
    expect(normalizeDate('2-25-26')).toBe('2026-02-25');
    expect(normalizeDate('12-31-99')).toBe('1999-12-31');
  });

  it('parses "MM/DD/YYYY"', () => {
    expect(normalizeDate('03/28/2026')).toBe('2026-03-28');
  });

  it('returns null for garbage', () => {
    expect(normalizeDate('not a date')).toBeNull();
    expect(normalizeDate('')).toBeNull();
  });
});

describe('normalizeDuration', () => {
  it('parses "N hours"', () => {
    expect(normalizeDuration('3 hours')).toBe('PT3H');
  });

  it('parses "N weeks"', () => {
    expect(normalizeDuration('2 weeks')).toBe('P2W');
  });

  it('parses "N minutes"', () => {
    expect(normalizeDuration('45 minutes')).toBe('PT45M');
  });

  it('parses compound durations', () => {
    expect(normalizeDuration('1 hour 30 minutes')).toBe('PT1H30M');
  });

  it('parses abbreviations', () => {
    expect(normalizeDuration('2hrs')).toBe('PT2H');
    expect(normalizeDuration('30min')).toBe('PT30M');
  });

  it('passes through ISO durations', () => {
    expect(normalizeDuration('PT3H')).toBe('PT3H');
    expect(normalizeDuration('P2W')).toBe('P2W');
  });

  it('returns null for garbage', () => {
    expect(normalizeDuration('not a duration')).toBeNull();
    expect(normalizeDuration('')).toBeNull();
  });
});

describe('normalizeAmount', () => {
  it('parses "100.00 USD"', () => {
    expect(normalizeAmount('100.00 USD')).toEqual({ amount: 100.0, currency: 'USD' });
  });

  it('parses "$100"', () => {
    expect(normalizeAmount('$100')).toEqual({ amount: 100, currency: 'USD' });
  });

  it('parses "€50.00"', () => {
    expect(normalizeAmount('€50.00')).toEqual({ amount: 50.0, currency: 'EUR' });
  });

  it('handles commas in amounts', () => {
    expect(normalizeAmount('1,250.00 USD')).toEqual({ amount: 1250.0, currency: 'USD' });
    expect(normalizeAmount('$1,000')).toEqual({ amount: 1000, currency: 'USD' });
  });

  it('returns null for garbage', () => {
    expect(normalizeAmount('free')).toBeNull();
    expect(normalizeAmount('')).toBeNull();
  });
});

describe('normalizeMeasure', () => {
  it('parses "500mg"', () => {
    expect(normalizeMeasure('500mg')).toEqual({ value: 500, unit: 'mg' });
  });

  it('parses "6 feet"', () => {
    expect(normalizeMeasure('6 feet')).toEqual({ value: 6, unit: 'feet' });
  });

  it('parses "98.6°F"', () => {
    expect(normalizeMeasure('98.6°F')).toEqual({ value: 98.6, unit: '°F' });
  });

  it('parses "1200 sqft"', () => {
    expect(normalizeMeasure('1200 sqft')).toEqual({ value: 1200, unit: 'sqft' });
  });

  it('handles commas', () => {
    expect(normalizeMeasure('1,200 sqft')).toEqual({ value: 1200, unit: 'sqft' });
  });

  it('returns null for no unit', () => {
    expect(normalizeMeasure('500')).toBeNull();
  });

  it('returns null for garbage', () => {
    expect(normalizeMeasure('heavy')).toBeNull();
  });
});

describe('normalizeQuantity', () => {
  it('parses integers', () => {
    expect(normalizeQuantity('42')).toBe(42);
  });

  it('parses floats', () => {
    expect(normalizeQuantity('3.5')).toBe(3.5);
  });

  it('handles commas', () => {
    expect(normalizeQuantity('1,000')).toBe(1000);
  });

  it('returns null for non-numbers', () => {
    expect(normalizeQuantity('many')).toBeNull();
  });
});

describe('normalizePercentage', () => {
  it('parses "15%"', () => {
    expect(normalizePercentage('15%')).toBeCloseTo(0.15);
  });

  it('parses "85 percent"', () => {
    expect(normalizePercentage('85 percent')).toBeCloseTo(0.85);
  });

  it('passes through decimals', () => {
    expect(normalizePercentage('0.15')).toBeCloseTo(0.15);
  });

  it('handles "15 %"', () => {
    expect(normalizePercentage('15 %')).toBeCloseTo(0.15);
  });

  it('returns null for garbage', () => {
    expect(normalizePercentage('high')).toBeNull();
  });
});

describe('normalizeContact', () => {
  it('lowercases emails', () => {
    expect(normalizeContact('Jane@Acme.COM', 'email')).toBe('jane@acme.com');
  });

  it('strips non-digits from phones', () => {
    expect(normalizeContact('(555) 010-0100', 'phone')).toBe('5550100100');
    expect(normalizeContact('+1-555-010-0100', 'phone')).toBe('+15550100100');
  });

  it('adds protocol to URLs', () => {
    expect(normalizeContact('acme.com', 'url')).toBe('https://acme.com');
    expect(normalizeContact('https://acme.com', 'url')).toBe('https://acme.com');
  });

  it('auto-detects type', () => {
    expect(normalizeContact('jane@acme.com')).toBe('jane@acme.com');
    expect(normalizeContact('https://acme.com')).toBe('https://acme.com');
  });
});

describe('normalizeMedia', () => {
  it('detects image types', () => {
    expect(normalizeMedia('evidence/photo.jpg')).toEqual({ path: 'evidence/photo.jpg', mediaType: 'image' });
    expect(normalizeMedia('img.png')).toEqual({ path: 'img.png', mediaType: 'image' });
  });

  it('detects video types', () => {
    expect(normalizeMedia('recording.mp4')).toEqual({ path: 'recording.mp4', mediaType: 'video' });
  });

  it('detects audio types', () => {
    expect(normalizeMedia('voicemail.wav')).toEqual({ path: 'voicemail.wav', mediaType: 'audio' });
  });

  it('detects document types', () => {
    expect(normalizeMedia('contract.pdf')).toEqual({ path: 'contract.pdf', mediaType: 'document' });
  });

  it('returns unknown for unrecognized extensions', () => {
    expect(normalizeMedia('data.xyz')).toEqual({ path: 'data.xyz', mediaType: 'unknown' });
  });

  it('returns null for empty', () => {
    expect(normalizeMedia('')).toBeNull();
  });
});

describe('normalizeString', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeString('  Officer  Davis  ')).toBe('Officer Davis');
  });
});
