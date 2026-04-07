// ============================================================================
// Block Parser
// Splits a markdown body into heading-delimited sections.
// Detects {#custom_id} anchors. Skips headings inside fenced code blocks.
// ============================================================================

import { blockId, type BlockId, type ParsedBlock } from '../types.js';

const ATX_HEADING_REGEX = /^(#{1,6})\s+(.+)$/;
const ANCHOR_REGEX = /\s*\{#([a-zA-Z0-9_-]+)\}\s*$/;
const FENCE_OPEN_REGEX = /^(`{3,}|~{3,})/;

export function parseBlocks(body: string, bodyStartLine: number): ParsedBlock[] {
  const lines = body.split('\n');
  const blocks: ParsedBlock[] = [];
  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;

  interface HeadingMark {
    id: BlockId | null;
    heading: string;
    level: number;
    startLine: number;
    contentStartIndex: number;
  }

  const headings: HeadingMark[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const absoluteLine = bodyStartLine + i;

    // Track fenced code blocks
    const fenceMatch = FENCE_OPEN_REGEX.exec(line.trimStart());
    if (fenceMatch) {
      const matchedFence = fenceMatch[1]!;
      if (!inFence) {
        inFence = true;
        fenceChar = matchedFence[0]!;
        fenceLen = matchedFence.length;
      } else if (line.trimStart().startsWith(fenceChar.repeat(fenceLen)) && line.trim().length <= fenceLen + 1) {
        // Closing fence: same char, at least same length, nothing else on line
        inFence = false;
      }
      continue;
    }

    if (inFence) continue;

    // Check for ATX heading
    const headingMatch = ATX_HEADING_REGEX.exec(line);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      let headingText = headingMatch[2]!.trim();
      let id: BlockId | null = null;

      // Extract {#custom_id} anchor
      const anchorMatch = ANCHOR_REGEX.exec(headingText);
      if (anchorMatch) {
        id = blockId(anchorMatch[1]!);
        headingText = headingText.slice(0, anchorMatch.index).trim();
      } else {
        // Auto-generate ID by slugifying the heading
        id = blockId(slugify(headingText));
      }

      headings.push({
        id,
        heading: headingText,
        level,
        startLine: absoluteLine,
        contentStartIndex: i + 1,
      });
    }
  }

  // If there's content before the first heading, create a preamble block
  const firstHeadingIndex = headings.length > 0 ? headings[0]!.contentStartIndex - 1 : lines.length;
  if (firstHeadingIndex > 0) {
    const preambleContent = lines.slice(0, firstHeadingIndex).join('\n').trim();
    if (preambleContent.length > 0) {
      blocks.push({
        id: null,
        heading: '',
        level: 0,
        startLine: bodyStartLine,
        endLine: bodyStartLine + firstHeadingIndex - 1,
        content: preambleContent,
      });
    }
  }

  // Build blocks from headings
  for (let h = 0; h < headings.length; h++) {
    const current = headings[h]!;
    const nextIndex = h + 1 < headings.length ? headings[h + 1]!.contentStartIndex - 1 : lines.length;

    const contentLines = lines.slice(current.contentStartIndex, nextIndex);
    const content = contentLines.join('\n').trim();

    const endLine = bodyStartLine + nextIndex - 1;

    blocks.push({
      id: current.id,
      heading: current.heading,
      level: current.level,
      startLine: current.startLine,
      endLine,
      content,
    });
  }

  return blocks;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
