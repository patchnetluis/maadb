// ============================================================================
// Git Commit Builder
// Formats structured commit messages and auto-commits on write operations.
// ============================================================================

import type { SimpleGit } from 'simple-git';
import type { DocId, DocType, CommitSha } from '../types.js';
import { commitSha } from '../types.js';

export interface CommitOptions {
  action: 'create' | 'update' | 'delete';
  docId: DocId;
  docType: DocType;
  detail: string;
  summary: string;
  files: string[];
}

// Format: maad:<action> <doc_id> [<doc_type>] <detail> — <summary>
export function formatCommitMessage(opts: CommitOptions): string {
  const detail = opts.detail ? `${opts.detail} ` : '';
  return `maad:${opts.action} ${opts.docId as string} [${opts.docType as string}] ${detail}— ${opts.summary}`;
}

// Parse a structured commit message back into components
const COMMIT_PARSE_REGEX = /^maad:(\w+)\s+([\w.-]+)\s+\[(\w+)\]\s*(.*?)\s*—\s*(.+)$/;

export interface ParsedCommitMessage {
  action: string;
  docId: string;
  docType: string;
  detail: string;
  summary: string;
}

export function parseCommitMessage(message: string): ParsedCommitMessage | null {
  const match = COMMIT_PARSE_REGEX.exec(message.split('\n')[0] ?? '');
  if (!match) return null;
  return {
    action: match[1]!,
    docId: match[2]!,
    docType: match[3]!,
    detail: match[4]!.trim(),
    summary: match[5]!.trim(),
  };
}

export async function autoCommit(
  git: SimpleGit,
  opts: CommitOptions,
): Promise<CommitSha | null> {
  try {
    // Stage specified files
    await git.add(opts.files);

    // Check if there's anything to commit
    const status = await git.status();
    if (status.staged.length === 0) return null;

    const message = formatCommitMessage(opts);
    const result = await git.commit(message);

    return result.commit ? commitSha(result.commit) : null;
  } catch {
    // Git errors during commit are non-fatal — the file write already succeeded
    return null;
  }
}
