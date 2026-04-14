// ============================================================================
// SessionRegistry — per-connection state for multi-project routing
//
// A session is created when an MCP client connects. The client binds the
// session to one project (single mode) or a whitelist (multi mode) via
// maad_use_project(s). Once bound, a session cannot rebind — it must
// disconnect and reconnect.
//
// Session IDs are derived from the MCP request context (SDK-supplied where
// possible) so the same code path works for stdio today and HTTP/SSE in 0.9.0.
// ============================================================================

import { randomUUID } from 'node:crypto';
import { ok, singleErr, type Result } from '../errors.js';
import { roleSatisfies, minRole, type Role } from '../mcp/roles.js';
import type { InstanceConfig } from './config.js';
import { getProject } from './config.js';

export type SessionMode = 'single' | 'multi';

export interface SessionState {
  sessionId: string;
  mode: SessionMode | null;
  activeProject?: string;
  whitelist?: string[];
  effectiveRoles: Map<string, Role>;
  createdAt: Date;
  lastActivityAt: Date;
}

export interface BindOptions {
  as?: Role;
}

export class SessionRegistry {
  private sessions = new Map<string, SessionState>();

  constructor(private instance: InstanceConfig) {}

  create(sessionId: string): SessionState {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;
    const state: SessionState = {
      sessionId,
      mode: null,
      effectiveRoles: new Map(),
      createdAt: new Date(),
      lastActivityAt: new Date(),
    };
    this.sessions.set(sessionId, state);
    return state;
  }

  get(sessionId: string): SessionState | undefined {
    const state = this.sessions.get(sessionId);
    if (state) state.lastActivityAt = new Date();
    return state;
  }

  destroy(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  size(): number {
    return this.sessions.size;
  }

  bindSingle(sessionId: string, projectName: string, opts: BindOptions = {}): Result<SessionState> {
    const state = this.sessions.get(sessionId);
    if (!state) return singleErr('SESSION_UNBOUND', `Unknown session: ${sessionId}`);
    if (state.mode !== null) {
      return singleErr('SESSION_ALREADY_BOUND', 'Session already bound — disconnect and reconnect to rebind');
    }

    const project = getProject(this.instance, projectName);
    if (!project) return singleErr('PROJECT_UNKNOWN', `Project "${projectName}" not declared in instance`);

    const effective = this.resolveEffectiveRole(project.role, opts.as);
    if (!effective.ok) return effective;

    state.mode = 'single';
    state.activeProject = projectName;
    state.effectiveRoles.set(projectName, effective.value);
    state.lastActivityAt = new Date();
    return ok(state);
  }

  bindMulti(sessionId: string, projectNames: string[], opts: BindOptions = {}): Result<SessionState> {
    const state = this.sessions.get(sessionId);
    if (!state) return singleErr('SESSION_UNBOUND', `Unknown session: ${sessionId}`);
    if (state.mode !== null) {
      return singleErr('SESSION_ALREADY_BOUND', 'Session already bound — disconnect and reconnect to rebind');
    }
    if (projectNames.length === 0) {
      return singleErr('INSTANCE_CONFIG_INVALID', 'bindMulti requires at least one project name');
    }

    const effectiveRoles = new Map<string, Role>();
    for (const name of projectNames) {
      const project = getProject(this.instance, name);
      if (!project) return singleErr('PROJECT_UNKNOWN', `Project "${name}" not declared in instance`);
      const effective = this.resolveEffectiveRole(project.role, opts.as);
      if (!effective.ok) return effective;
      effectiveRoles.set(name, effective.value);
    }

    state.mode = 'multi';
    state.whitelist = [...projectNames];
    state.effectiveRoles = effectiveRoles;
    state.lastActivityAt = new Date();
    return ok(state);
  }

  private resolveEffectiveRole(projectRole: Role, requested?: Role): Result<Role> {
    if (!requested) return ok(projectRole);
    if (!roleSatisfies(projectRole, requested)) {
      return singleErr('ROLE_UPGRADE_DENIED',
        `Cannot bind as ${requested} — project role is ${projectRole}`);
    }
    return ok(minRole(projectRole, requested));
  }
}

// Session ID resolution. MCP SDK v1.29+ exposes a session identifier via
// request meta in some transports. Where it's unavailable (stdio today),
// we synthesize one UUID per process and reuse it — stdio is single-client
// so that's equivalent to "this connection." HTTP/SSE in 0.9.0 will supply
// a real per-connection ID through transport middleware.
let processStdioSessionId: string | null = null;

// `extra` is the second arg MCP SDK passes to tool handlers (RequestHandlerExtra).
// It exposes `sessionId` when the transport supplies one (HTTP/SSE in 0.9.0).
// stdio today does not, so we fall back to a stable per-process UUID.
export function resolveSessionId(extra: unknown): string {
  if (extra && typeof extra === 'object') {
    const sid = (extra as Record<string, unknown>).sessionId;
    if (typeof sid === 'string' && sid.length > 0) return sid;
    const meta = (extra as Record<string, unknown>)._meta;
    if (meta && typeof meta === 'object') {
      const metaSid = (meta as Record<string, unknown>).sessionId;
      if (typeof metaSid === 'string' && metaSid.length > 0) return metaSid;
    }
    const params = (extra as Record<string, unknown>).params;
    if (params && typeof params === 'object') {
      const paramMeta = (params as Record<string, unknown>)._meta;
      if (paramMeta && typeof paramMeta === 'object') {
        const paramSid = (paramMeta as Record<string, unknown>).sessionId;
        if (typeof paramSid === 'string' && paramSid.length > 0) return paramSid;
      }
    }
  }
  if (!processStdioSessionId) processStdioSessionId = `stdio-${randomUUID()}`;
  return processStdioSessionId;
}

// Test hook — resets the stdio fallback. Production code never calls this.
export function __resetStdioSessionId(): void {
  processStdioSessionId = null;
}
