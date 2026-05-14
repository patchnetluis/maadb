// ============================================================================
// AI Guardrails — tool allowlists, dry-run, audit logging
// ============================================================================

import { logger } from '../engine/logger.js';
import type { MaadError } from '../errors.js';

export interface GuardrailConfig {
  dryRun?: boolean | undefined;
  toolAllowlist?: string[] | undefined;
}

let config: GuardrailConfig = {};

export function setGuardrailConfig(c: GuardrailConfig): void {
  config = c;
}

export function isDryRun(): boolean {
  return config.dryRun ?? false;
}

export function isToolAllowed(toolName: string): boolean {
  if (!config.toolAllowlist || config.toolAllowlist.length === 0) return true;
  return config.toolAllowlist.includes(toolName);
}

/**
 * Audit-log marker for whether a destructive call ran as dry-run or confirmed.
 * Stamped on the audit payload via auditToolCall's `extras` argument so
 * post-hoc audit can distinguish exploration from action.
 */
export type ConfirmMode = 'dry_run' | 'confirmed';

/**
 * Confirm-contract guard for destructive tools (0.7.10).
 *
 * Returns null when args.confirm === true (caller has authorized mutation),
 * otherwise returns a CONFIRM_REQUIRED MaadError. Boolean strictness — no
 * truthy coercion; only literal true authorizes mutation. Callers decide
 * whether to surface the error or return a dry-run response carrying the
 * affected set. Spec default is the dry-run path.
 */
export function requireConfirm(args: { confirm?: unknown }): MaadError | null {
  if (args.confirm === true) return null;
  return {
    code: 'CONFIRM_REQUIRED',
    message: 'Mutation requires explicit confirm: true. Without it, the tool returns the would-affect result set without side effects.',
  };
}

/**
 * Log every tool call for audit trail. Optional `extras` lets destructive
 * tools stamp confirm_mode (and future fields) on the audit payload without
 * needing a separate writer.
 */
export function auditToolCall(
  toolName: string,
  args: Record<string, unknown>,
  extras?: Record<string, unknown>,
): void {
  logger.info('mcp', 'tool_call', `${toolName}`, extras ? { args, ...extras } : { args });
}

/**
 * Dry-run response: returns what would happen without executing.
 */
export function dryRunResponse(toolName: string, args: Record<string, unknown>): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        ok: true,
        dryRun: true,
        tool: toolName,
        wouldExecute: args,
      }),
    }],
  };
}
