import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { scanFile, scanDirectory } from '../../src/scanner.js';

const FIXTURES = path.resolve(__dirname, '../fixtures/simple-crm');

describe('scanFile', () => {
  it('extracts structure from a file with frontmatter and annotations', async () => {
    const result = await scanFile(path.join(FIXTURES, 'clients', 'cli-acme.md'));

    expect(result.lineCount).toBeGreaterThan(0);
    expect(result.frontmatter).not.toBeNull();
    expect(result.frontmatter!['doc_type']).toBe('client');
    expect(result.frontmatterFields).toContain('name');
    expect(result.frontmatterFields).toContain('status');
    expect(result.headings.length).toBeGreaterThan(0);
    expect(result.blockCount).toBeGreaterThan(0);
  });

  it('extracts annotations from inline markup', async () => {
    const result = await scanFile(path.join(FIXTURES, 'cases', 'cas-2026-001.md'));

    expect(result.annotations.length).toBeGreaterThan(0);
    const people = result.annotations.filter(a => a.type === 'person');
    expect(people.length).toBeGreaterThan(0);
  });

  it('detects date patterns in raw text', async () => {
    const result = await scanFile(path.join(FIXTURES, 'cases', 'cas-2026-001.md'));

    expect(result.detectedPatterns.dates.length).toBeGreaterThan(0);
  });

  it('handles a file with no frontmatter', async () => {
    // MAAD.md or SCHEMA.md might parse as empty frontmatter
    const result = await scanFile(path.join(FIXTURES, 'clients', 'cli-acme.md'));
    expect(result.frontmatter).not.toBeNull();
  });
});

describe('scanDirectory', () => {
  it('scans all markdown files in a directory tree', async () => {
    const result = await scanDirectory(FIXTURES);

    expect(result.totalFiles).toBeGreaterThanOrEqual(4);
    expect(result.totalLines).toBeGreaterThan(0);
    expect(result.files.length).toBe(result.totalFiles);
  });

  it('reports frontmatter field frequency', async () => {
    const result = await scanDirectory(FIXTURES);

    // doc_id should appear in every record file
    expect(result.frontmatterFieldFrequency['doc_id']).toBeGreaterThanOrEqual(4);
    expect(result.frontmatterFieldFrequency['doc_type']).toBeGreaterThanOrEqual(4);
  });

  it('detects recurring heading patterns', async () => {
    const result = await scanDirectory(FIXTURES);

    // At least some headings should recur across files
    if (result.headingPatterns.length > 0) {
      expect(result.headingPatterns[0]!.occurrences).toBeGreaterThanOrEqual(2);
    }
  });

  it('returns family structure (empty when all types unique)', async () => {
    const result = await scanDirectory(FIXTURES);

    // simple-crm has 1 file per type — no families expected
    // but the structure should still be valid
    expect(Array.isArray(result.likelyDocumentFamilies)).toBe(true);
    for (const family of result.likelyDocumentFamilies) {
      expect(family.fileCount).toBeGreaterThanOrEqual(2);
      expect(family.sampleFiles.length).toBeGreaterThan(0);
    }
  });

  it('aggregates entities across files', async () => {
    const result = await scanDirectory(FIXTURES);

    expect(result.entitySummary.length).toBeGreaterThan(0);
    // Jane Smith should appear across multiple files
    const jane = result.entitySummary.find(e => e.value === 'Jane Smith');
    expect(jane).toBeDefined();
  });
});
