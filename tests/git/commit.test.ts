import { describe, it, expect } from 'vitest';
import { formatCommitMessage, parseCommitMessage } from '../../src/git/commit.js';
import { docId, docType } from '../../src/types.js';

describe('formatCommitMessage', () => {
  it('formats a create message', () => {
    const msg = formatCommitMessage({
      action: 'create',
      docId: docId('cli-acme'),
      docType: docType('client'),
      detail: '',
      summary: 'Acme Corporation',
      files: [],
    });
    expect(msg).toBe('maad:create cli-acme [client] — Acme Corporation');
  });

  it('formats an update message with detail', () => {
    const msg = formatCommitMessage({
      action: 'update',
      docId: docId('cas-2026-001'),
      docType: docType('case'),
      detail: 'fields:status',
      summary: 'status: open -> pending',
      files: [],
    });
    expect(msg).toBe('maad:update cas-2026-001 [case] fields:status — status: open -> pending');
  });

  it('formats a delete message', () => {
    const msg = formatCommitMessage({
      action: 'delete',
      docId: docId('note-001'),
      docType: docType('case_note'),
      detail: 'soft',
      summary: 'Soft deleted note-001',
      files: [],
    });
    expect(msg).toBe('maad:delete note-001 [case_note] soft — Soft deleted note-001');
  });
});

describe('parseCommitMessage', () => {
  it('round-trips a create message', () => {
    const msg = 'maad:create cli-acme [client] — Acme Corporation';
    const parsed = parseCommitMessage(msg);
    expect(parsed).not.toBeNull();
    expect(parsed!.action).toBe('create');
    expect(parsed!.docId).toBe('cli-acme');
    expect(parsed!.docType).toBe('client');
    expect(parsed!.detail).toBe('');
    expect(parsed!.summary).toBe('Acme Corporation');
  });

  it('round-trips an update message with detail', () => {
    const msg = 'maad:update cas-2026-001 [case] fields:status — status: open -> pending';
    const parsed = parseCommitMessage(msg);
    expect(parsed).not.toBeNull();
    expect(parsed!.action).toBe('update');
    expect(parsed!.docId).toBe('cas-2026-001');
    expect(parsed!.detail).toBe('fields:status');
    expect(parsed!.summary).toBe('status: open -> pending');
  });

  it('returns null for non-MAAD commits', () => {
    expect(parseCommitMessage('Initial commit')).toBeNull();
    expect(parseCommitMessage('fix: typo in readme')).toBeNull();
    expect(parseCommitMessage('')).toBeNull();
  });

  it('handles doc_ids with dots', () => {
    const msg = 'maad:create client.v1 [schema] — Schema definition';
    const parsed = parseCommitMessage(msg);
    expect(parsed).not.toBeNull();
    expect(parsed!.docId).toBe('client.v1');
  });
});
