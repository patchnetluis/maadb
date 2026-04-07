// ============================================================================
// Verbatim Zone Detection
// Identifies fenced code blocks, indented code blocks, and inline code spans
// where MAAD custom syntax ({{...}}, [[...]]) must NOT be parsed.
// ============================================================================

import type { VerbatimZone } from '../types.js';

const FENCE_OPEN_REGEX = /^(\s*(`{3,}|~{3,}))/;

export function findVerbatimZones(body: string, bodyStartLine: number): VerbatimZone[] {
  const zones: VerbatimZone[] = [];
  const lines = body.split('\n');

  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;
  let fenceStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const absoluteLine = bodyStartLine + i;

    // Fenced code blocks
    const fenceMatch = FENCE_OPEN_REGEX.exec(line);
    if (fenceMatch) {
      const fence = fenceMatch[2]!;
      if (!inFence) {
        inFence = true;
        fenceChar = fence[0]!;
        fenceLen = fence.length;
        fenceStart = absoluteLine;
        continue;
      }

      // Check if this is a closing fence
      const trimmed = line.trimStart();
      if (trimmed[0] === fenceChar && !inFenceHasExtra(trimmed, fenceChar, fenceLen)) {
        zones.push({
          startLine: fenceStart,
          endLine: absoluteLine,
          inline: false,
        });
        inFence = false;
        continue;
      }
    }

    if (inFence) continue;

    // Inline code spans — find ` pairs within the line
    findInlineCodeSpans(line, absoluteLine, zones);
  }

  // If we're still in a fence at EOF, close it
  if (inFence) {
    zones.push({
      startLine: fenceStart,
      endLine: bodyStartLine + lines.length - 1,
      inline: false,
    });
  }

  return zones;
}

function inFenceHasExtra(trimmed: string, char: string, minLen: number): boolean {
  // A closing fence is: same char repeated >= fenceLen, optionally followed by whitespace only
  let count = 0;
  for (const c of trimmed) {
    if (c === char) count++;
    else break;
  }
  if (count < minLen) return true; // not enough chars, not a closer
  // Check remainder is whitespace only
  const remainder = trimmed.slice(count).trim();
  return remainder.length > 0;
}

function findInlineCodeSpans(
  line: string,
  absoluteLine: number,
  zones: VerbatimZone[],
): void {
  let i = 0;
  while (i < line.length) {
    if (line[i] === '`') {
      // Count opening backticks
      let openLen = 0;
      const openStart = i;
      while (i < line.length && line[i] === '`') {
        openLen++;
        i++;
      }

      // Find matching closing backticks
      const closeTarget = '`'.repeat(openLen);
      const closeIndex = line.indexOf(closeTarget, i);
      if (closeIndex !== -1) {
        zones.push({
          startLine: absoluteLine,
          endLine: absoluteLine,
          startCol: openStart,
          endCol: closeIndex + openLen,
          inline: true,
        });
        i = closeIndex + openLen;
      }
    } else {
      i++;
    }
  }
}

export function isInVerbatimZone(
  line: number,
  col: number,
  zones: VerbatimZone[],
): boolean {
  for (const zone of zones) {
    if (zone.inline) {
      // Inline code span: same line, check column range
      if (line === zone.startLine &&
          zone.startCol !== undefined &&
          zone.endCol !== undefined &&
          col >= zone.startCol &&
          col < zone.endCol) {
        return true;
      }
    } else {
      // Block zone: check line range
      if (line >= zone.startLine && line <= zone.endLine) {
        return true;
      }
    }
  }
  return false;
}
