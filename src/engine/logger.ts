// ============================================================================
// Engine Logger — structured error/event logging with severity policy
// All engine operations log through this instead of console.warn/silent catch.
// Emits via the pino ops logger from src/logging.ts so output is JSON.
// ============================================================================

import { getOpsLog } from '../logging.js';

export type Severity = 'fatal' | 'error' | 'degraded' | 'best_effort' | 'info';

export interface LogEntry {
  severity: Severity;
  category: string;
  operation: string;
  message: string;
  details?: Record<string, unknown> | undefined;
}

export type LogHandler = (entry: LogEntry) => void;

const severityToLevel: Record<Severity, 'fatal' | 'error' | 'warn' | 'info'> = {
  fatal: 'fatal',
  error: 'error',
  degraded: 'warn',
  best_effort: 'warn',
  info: 'info',
};

const defaultHandler: LogHandler = (entry) => {
  const level = severityToLevel[entry.severity];
  const log = getOpsLog();
  const payload = {
    event: 'engine',
    category: entry.category,
    operation: entry.operation,
    ...(entry.details ?? {}),
  };
  (log[level] as (o: object, msg: string) => void)(payload, entry.message);
};

let handler: LogHandler = defaultHandler;

export function setLogHandler(h: LogHandler): void {
  handler = h;
}

export function log(
  severity: Severity,
  category: string,
  operation: string,
  message: string,
  details?: Record<string, unknown>,
): void {
  handler({ severity, category, operation, message, details });
}

// Convenience shortcuts
export const logger = {
  fatal: (cat: string, op: string, msg: string, details?: Record<string, unknown>) => log('fatal', cat, op, msg, details),
  error: (cat: string, op: string, msg: string, details?: Record<string, unknown>) => log('error', cat, op, msg, details),
  degraded: (cat: string, op: string, msg: string, details?: Record<string, unknown>) => log('degraded', cat, op, msg, details),
  bestEffort: (cat: string, op: string, msg: string, details?: Record<string, unknown>) => log('best_effort', cat, op, msg, details),
  info: (cat: string, op: string, msg: string, details?: Record<string, unknown>) => log('info', cat, op, msg, details),
};
