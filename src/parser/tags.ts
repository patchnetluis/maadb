// ============================================================================
// Value Call Extractor
// Extracts {{field}} references from markdown body.
// Skips matches inside verbatim zones (code blocks, code spans).
// ============================================================================

import type { FilePath, ValueCall, VerbatimZone } from '../types.js';
import { isInVerbatimZone } from './verbatim.js';

const VALUE_CALL_REGEX = /\{\{([a-zA-Z_][a-zA-Z0-9_.]*)\}\}/g;

export function extractValueCalls(
  body: string,
  bodyStartLine: number,
  filePath: FilePath,
  verbatimZones: VerbatimZone[],
): ValueCall[] {
  const calls: ValueCall[] = [];
  const lines = body.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const absoluteLine = bodyStartLine + i;

    let match: RegExpExecArray | null;
    VALUE_CALL_REGEX.lastIndex = 0;

    while ((match = VALUE_CALL_REGEX.exec(line)) !== null) {
      const col = match.index;

      if (isInVerbatimZone(absoluteLine, col, verbatimZones)) continue;

      calls.push({
        field: match[1]!,
        location: {
          file: filePath,
          line: absoluteLine,
          col,
        },
      });
    }
  }

  return calls;
}
