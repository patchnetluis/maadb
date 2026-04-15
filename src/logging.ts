// ============================================================================
// Logging — two pino loggers, ops + audit.
//
// opsLog   one line per MCP tool call, plus engine-layer events (write_slow,
//          shutdown_start, etc.). Level env-tunable. Redacts authorization
//          and common token fields.
//
// auditLog one line per successful write. Before/after version, changed
//          fields, git commit SHA. Separable to a dedicated file via
//          MAAD_AUDIT_PATH for operators who want an append-only audit trail.
//
// Both are pino instances — fast JSON, zero overhead for gated levels,
// first-class redaction. Test hook: resetLoggers() lets tests inject a
// destination (via environment + pino transports) or capture output via a
// child with a memory destination. See tests/mcp/logging.test.ts for the
// pattern.
// ============================================================================

import pino, { type Logger, type DestinationStream } from 'pino';
import { createWriteStream } from 'node:fs';

const REDACT_PATHS = [
  'args.authorization',
  'args.token',
  'args.bearer',
  'args.headers.authorization',
  'authorization',
  'headers.authorization',
];

export interface LoggingOptions {
  level?: string;
  pretty?: boolean;
  auditPath?: string;
  // Test hook — an explicit destination stream overrides all file/pretty wiring.
  opsDestination?: DestinationStream;
  auditDestination?: DestinationStream;
}

let opsLog: Logger;
let auditLog: Logger;

function buildOps(opts: LoggingOptions): Logger {
  const level = opts.level ?? process.env.MAAD_LOG_LEVEL ?? 'info';
  if (opts.opsDestination) {
    return pino({ level, redact: { paths: REDACT_PATHS, censor: '[redacted]' } }, opts.opsDestination);
  }
  // pino-pretty is only wired when explicitly requested; in production we want
  // raw JSON to stdout so operators can pipe through whatever aggregator.
  if (opts.pretty ?? process.env.MAAD_LOG_PRETTY === '1') {
    return pino({
      level,
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
      transport: { target: 'pino-pretty', options: { colorize: true } },
    });
  }
  return pino({ level, redact: { paths: REDACT_PATHS, censor: '[redacted]' } });
}

function buildAudit(opts: LoggingOptions): Logger {
  // Audit is always 'info' — it records discrete state changes, level gating
  // would defeat its purpose.
  const level = 'info';
  if (opts.auditDestination) {
    return pino({ level, base: { channel: 'audit' } }, opts.auditDestination);
  }
  const auditPath = opts.auditPath ?? process.env.MAAD_AUDIT_PATH;
  if (auditPath && auditPath.length > 0) {
    const stream = createWriteStream(auditPath, { flags: 'a' });
    return pino({ level, base: { channel: 'audit' } }, stream);
  }
  // Fall through to stdout with channel tag so operators can grep/split later.
  return pino({ level, base: { channel: 'audit' } });
}

export function initLogging(opts: LoggingOptions = {}): void {
  opsLog = buildOps(opts);
  auditLog = buildAudit(opts);
}

// Eager default — safe to call getOpsLog()/getAuditLog() before initLogging().
initLogging();

export function getOpsLog(): Logger { return opsLog; }
export function getAuditLog(): Logger { return auditLog; }

export function readLoggingEnv(): LoggingOptions {
  const opts: LoggingOptions = {};
  if (process.env.MAAD_LOG_LEVEL) opts.level = process.env.MAAD_LOG_LEVEL;
  if (process.env.MAAD_LOG_PRETTY === '1') opts.pretty = true;
  if (process.env.MAAD_AUDIT_PATH) opts.auditPath = process.env.MAAD_AUDIT_PATH;
  return opts;
}

// ---- Tool-call event (ops) -------------------------------------------------

export interface ToolCallLogFields {
  request_id: string;
  session_id: string;
  project: string | null;
  tool: string;
  role: string | null;
  payload_size: number;
  latency_ms: number;
  result: 'ok' | 'error';
  error_code: string | null;
}

export function logToolCall(fields: ToolCallLogFields): void {
  opsLog.info(fields, 'tool_call');
}

// ---- Write event (audit) ---------------------------------------------------

export interface WriteAuditFields {
  request_id: string;
  session_id: string;
  project: string;
  tool: string;
  doc_id: string | null;
  doc_ids?: string[];
  doc_type: string | null;
  version_before: number | null;
  version_after: number | null;
  changed_fields: string[];
  git_commit: string | null;
}

export function logWriteAudit(fields: WriteAuditFields): void {
  auditLog.info(fields, 'write');
}
