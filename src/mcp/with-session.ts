// ============================================================================
// withEngine — the routing helper every project-level tool wraps around.
//
// Resolves the correct engine for the current MCP call:
//   1. Pull/create the session from the request's sessionId.
//   2. In legacy (synthetic) mode, auto-bind to the single project on first
//      call so existing 0.2.x clients work unchanged.
//   3. In real instance mode, require the client to have already bound via
//      maad_use_project(s).
//   4. Pick the project (activeProject in single mode, args.project in multi).
//   5. Gate by tool's minimum role vs the session's effective role.
//   6. Load/cache the engine via EnginePool.
//   7. Hand engine + project meta to the inner handler.
// ============================================================================

import { randomUUID } from 'node:crypto';
import type { MaadEngine } from '../engine.js';
import type { MaadError } from '../errors.js';
import type { InstanceCtx } from './ctx.js';
import type { SessionState } from '../instance/session.js';
import { resolveSessionId } from '../instance/session.js';
import { getMinRoleForTool, roleSatisfies } from './roles.js';
import { errorResponse, attachMeta } from './response.js';
import { getRateLimiter } from './rate-limit.js';
import { logToolCall } from '../logging.js';

interface CallContext {
  engine: MaadEngine;
  projectName: string;
  projectRoot: string;
  sessionId: string;
  requestId: string;
}

type McpToolResponse = { content: Array<{ type: 'text'; text: string }> };

// Wrap a tool handler so it runs against the engine chosen by the current
// session. Call this inside every project-level tool registration.
//
// Every call gets a fresh request_id (UUID). It is:
//   - stamped onto the response as _meta.request_id
//   - emitted on the ops log in the trailing tool_call line
//   - passed into the handler (so audit logs and idempotency can reference it)
//
// The function has several early-return points (session errors, role, payload,
// concurrent). All of them flow through `finalize()` so every response — success
// or rejection — is logged uniformly.
export async function withEngine(
  ctx: InstanceCtx,
  extra: unknown,
  toolName: string,
  args: Record<string, unknown> | undefined,
  handler: (call: CallContext) => Promise<McpToolResponse> | McpToolResponse
): Promise<McpToolResponse> {
  const requestId = randomUUID();
  const startedMs = Date.now();
  const sessionId = resolveSessionId(extra);
  const payloadBytes = args ? Buffer.byteLength(JSON.stringify(args), 'utf8') : 0;

  let projectForLog: string | null = null;
  let roleForLog: string | null = null;

  const finalize = (response: McpToolResponse): McpToolResponse => {
    const stamped = attachMeta(response, { request_id: requestId });
    const latencyMs = Date.now() - startedMs;
    const { result, errorCode } = inspectResponse(stamped);
    logToolCall({
      request_id: requestId,
      session_id: sessionId,
      project: projectForLog,
      tool: toolName,
      role: roleForLog,
      payload_size: payloadBytes,
      latency_ms: latencyMs,
      result,
      error_code: errorCode,
    });
    return stamped;
  };

  let state = ctx.sessions.get(sessionId);
  if (!state) state = ctx.sessions.create(sessionId);

  // Legacy single-project instance: auto-bind to 'default' on first call.
  if (state.mode === null && ctx.instance.source === 'synthetic') {
    const bindResult = ctx.sessions.bindSingle(sessionId, 'default');
    if (!bindResult.ok) return finalize(errorResponse(bindResult.errors));
    state = bindResult.value;
  }

  if (state.mode === null) {
    return finalize(mcpError('SESSION_UNBOUND',
      'No project bound for this session. Call maad_use_project(s) first.'));
  }

  // Pick project
  const projectName = resolveProjectName(state, args);
  if (typeof projectName !== 'string') return finalize(projectName); // error response
  projectForLog = projectName;

  // Role check
  const effectiveRole = state.effectiveRoles.get(projectName);
  if (!effectiveRole) {
    return finalize(mcpError('PROJECT_NOT_WHITELISTED',
      `Session is not bound to project "${projectName}".`));
  }
  roleForLog = effectiveRole;
  const minRole = getMinRoleForTool(toolName);
  if (minRole && !roleSatisfies(effectiveRole, minRole)) {
    return finalize(mcpError('INSUFFICIENT_ROLE',
      `Tool ${toolName} requires role "${minRole}" but session has "${effectiveRole}" for project "${projectName}".`));
  }

  // Payload size cap. Oversize args are rejected without touching the engine.
  const rl = getRateLimiter();
  const payloadRejection = rl.checkPayloadSize(payloadBytes);
  if (payloadRejection) {
    return finalize(mcpErrorWithDetails('RATE_LIMITED', 'Payload exceeds limit', {
      reason: payloadRejection.reason,
      limit: payloadRejection.limit,
      retryAfterMs: payloadRejection.retryAfterMs,
      size: payloadBytes,
    }));
  }

  // Concurrent-in-flight cap. Released in the `finally` below so an engine
  // error never leaks a slot.
  const slot = rl.tryAcquireConcurrent(sessionId);
  if (!slot.ok) {
    return finalize(mcpErrorWithDetails('RATE_LIMITED', 'Concurrent in-flight limit reached', {
      reason: slot.rejection.reason,
      limit: slot.rejection.limit,
      retryAfterMs: slot.rejection.retryAfterMs,
    }));
  }

  try {
    // Resolve engine
    const poolResult = await ctx.pool.get(projectName);
    if (!poolResult.ok) return finalize(errorResponse(poolResult.errors));

    const project = ctx.instance.projects.find((p) => p.name === projectName)!;
    const response = await handler({
      engine: poolResult.value,
      projectName,
      projectRoot: project.path,
      sessionId,
      requestId,
    });
    return finalize(response);
  } finally {
    slot.release();
  }
}

function inspectResponse(response: McpToolResponse): { result: 'ok' | 'error'; errorCode: string | null } {
  const first = response.content[0];
  if (!first || first.type !== 'text') return { result: 'error', errorCode: null };
  try {
    const parsed = JSON.parse(first.text) as { ok?: unknown; errors?: Array<{ code?: string }> };
    if (parsed.ok === true) return { result: 'ok', errorCode: null };
    const code = parsed.errors?.[0]?.code ?? null;
    return { result: 'error', errorCode: code };
  } catch {
    return { result: 'error', errorCode: null };
  }
}

function resolveProjectName(state: SessionState, args: Record<string, unknown> | undefined): string | McpToolResponse {
  if (state.mode === 'single') {
    return state.activeProject!;
  }
  // multi mode
  const raw = args && typeof args.project === 'string' ? args.project : undefined;
  if (!raw) {
    return mcpError('PROJECT_REQUIRED',
      'Multi-project session requires `project=<name>` on every call.');
  }
  if (!state.whitelist!.includes(raw)) {
    return mcpError('PROJECT_NOT_WHITELISTED',
      `Project "${raw}" is not in this session's whitelist: [${state.whitelist!.join(', ')}]`);
  }
  return raw;
}

function mcpError(code: string, message: string): McpToolResponse {
  const err: MaadError = { code: code as MaadError['code'], message };
  return errorResponse([err]);
}

function mcpErrorWithDetails(code: string, message: string, details: Record<string, unknown>): McpToolResponse {
  const err: MaadError = { code: code as MaadError['code'], message, details };
  return errorResponse([err]);
}
