import { describe, it, expect } from 'vitest';
import { extractAnnotations } from '../../src/parser/annotations.js';
import { findVerbatimZones } from '../../src/parser/verbatim.js';
import { filePath, DEFAULT_SUBTYPE_MAP } from '../../src/types.js';

const fp = filePath('test.md');
const map = DEFAULT_SUBTYPE_MAP;

describe('extractAnnotations', () => {
  it('extracts [[type:value|label]] annotations', () => {
    const body = 'Met with [[person:Bob Smith|Bob]] on [[date:2026-03-28|March 28]].';
    const zones = findVerbatimZones(body, 5);
    const anns = extractAnnotations(body, 5, fp, map, zones);
    expect(anns).toHaveLength(2);

    expect(anns[0]!.rawType).toBe('person');
    expect(anns[0]!.primitive).toBe('entity');
    expect(anns[0]!.value).toBe('Bob Smith');
    expect(anns[0]!.label).toBe('Bob');

    expect(anns[1]!.rawType).toBe('date');
    expect(anns[1]!.primitive).toBe('date');
    expect(anns[1]!.value).toBe('2026-03-28');
    expect(anns[1]!.label).toBe('March 28');
  });

  it('resolves subtypes to primitives', () => {
    const body = `
[[team:Heat|Heat]]
[[org:Acme Corp|Acme]]
[[address:123 Main St|office]]
[[invoice:INV-001|Invoice 1]]
[[email:bob@test.com|Bob email]]
[[image:photo.jpg|Photo]]
[[dosage:500mg|500mg]]
[[rate:15%|15 percent]]
[[timespan:3 hours|3h]]
`.trim();
    const zones = findVerbatimZones(body, 5);
    const anns = extractAnnotations(body, 5, fp, map, zones);

    expect(anns.find(a => a.rawType === 'team')!.primitive).toBe('entity');
    expect(anns.find(a => a.rawType === 'org')!.primitive).toBe('entity');
    expect(anns.find(a => a.rawType === 'address')!.primitive).toBe('location');
    expect(anns.find(a => a.rawType === 'invoice')!.primitive).toBe('identifier');
    expect(anns.find(a => a.rawType === 'email')!.primitive).toBe('contact');
    expect(anns.find(a => a.rawType === 'image')!.primitive).toBe('media');
    expect(anns.find(a => a.rawType === 'dosage')!.primitive).toBe('measure');
    expect(anns.find(a => a.rawType === 'rate')!.primitive).toBe('percentage');
    expect(anns.find(a => a.rawType === 'timespan')!.primitive).toBe('duration');
  });

  it('defaults unknown subtypes to entity', () => {
    const body = '[[vehicle:F-150|F-150]]';
    const zones = findVerbatimZones(body, 5);
    const anns = extractAnnotations(body, 5, fp, map, zones);
    expect(anns[0]!.rawType).toBe('vehicle');
    expect(anns[0]!.primitive).toBe('entity');
  });

  it('skips annotations inside fenced code blocks', () => {
    const body = `Real: [[person:Alice|Alice]].

\`\`\`
Not real: [[person:Bob|Bob]].
\`\`\`

Also real: [[person:Charlie|Charlie]].`;
    const zones = findVerbatimZones(body, 5);
    const anns = extractAnnotations(body, 5, fp, map, zones);
    expect(anns).toHaveLength(2);
    expect(anns.map(a => a.value)).toEqual(['Alice', 'Charlie']);
  });

  it('skips annotations inside inline code', () => {
    const body = 'Use `[[person:Bob|Bob]]` as syntax. Real: [[person:Alice|Alice]].';
    const zones = findVerbatimZones(body, 5);
    const anns = extractAnnotations(body, 5, fp, map, zones);
    expect(anns).toHaveLength(1);
    expect(anns[0]!.value).toBe('Alice');
  });

  it('handles multiple annotations on one line', () => {
    const body = '[[person:Bob|Bob]] paid [[amount:100.00 USD|$100]] on [[date:2026-02-25|2-25]].';
    const zones = findVerbatimZones(body, 5);
    const anns = extractAnnotations(body, 5, fp, map, zones);
    expect(anns).toHaveLength(3);
  });

  it('trims value and label whitespace', () => {
    const body = '[[person: Bob Smith | Bob ]].';
    const zones = findVerbatimZones(body, 5);
    const anns = extractAnnotations(body, 5, fp, map, zones);
    expect(anns[0]!.value).toBe('Bob Smith');
    expect(anns[0]!.label).toBe('Bob');
  });

  it('returns empty for no annotations', () => {
    const body = 'Plain text with no annotations.';
    const zones = findVerbatimZones(body, 5);
    const anns = extractAnnotations(body, 5, fp, map, zones);
    expect(anns).toHaveLength(0);
  });

  it('respects project-extended subtype map', () => {
    const extendedMap = { ...map, vehicle: 'entity' as const, filing_date: 'date' as const };
    const body = '[[vehicle:F-150|truck]] filed on [[filing_date:2026-04-01|April 1]].';
    const zones = findVerbatimZones(body, 5);
    const anns = extractAnnotations(body, 5, fp, extendedMap, zones);
    expect(anns[0]!.primitive).toBe('entity');
    expect(anns[1]!.primitive).toBe('date');
  });
});
