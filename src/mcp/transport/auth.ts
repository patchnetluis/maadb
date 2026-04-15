// ============================================================================
// Bearer token auth for HTTP transport (0.5.0 R2)
//
// Single shared secret model. Every HTTP request to /mcp must carry an
// `Authorization: Bearer <token>` header; the token is constant-time-compared
// against the value supplied at boot via MAAD_AUTH_TOKEN. Failed checks
// return 401 UNAUTHORIZED with no detail about which check failed or what
// token was presented.
//
// Non-goals (deferred to 0.8.5):
//   - Per-connection role tiers / token→role mapping
//   - Token rotation without restart
//   - OAuth / JWT / any claims-based auth
// ============================================================================

import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export type AuthFailureReason = 'missing' | 'invalid';

export type AuthResult =
  | { ok: true }
  | { ok: false; reason: AuthFailureReason };

/**
 * Extract the bearer token from the Authorization header.
 * Returns undefined if absent or malformed (no leak about why).
 */
function extractBearer(headerValue: string | string[] | undefined): string | undefined {
  if (typeof headerValue !== 'string') return undefined;
  const trimmed = headerValue.trim();
  if (trimmed.length < 8) return undefined; // "Bearer x" minimum
  // Case-insensitive scheme match; token is whatever follows the first space.
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx < 0) return undefined;
  const scheme = trimmed.slice(0, spaceIdx).toLowerCase();
  if (scheme !== 'bearer') return undefined;
  const token = trimmed.slice(spaceIdx + 1).trim();
  return token.length > 0 ? token : undefined;
}

/**
 * Constant-time comparison that is safe on unequal-length inputs.
 * timingSafeEqual throws on length mismatch, so we short-circuit but still
 * run a dummy compare to normalize timing regardless of which branch we took.
 */
function constantTimeEqual(a: string, b: string): boolean {
  // Always allocate buffers of the same length based on the expected secret
  // so that the dummy-compare on the mismatch path has stable timing.
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) {
    // Still do a compare to normalize timing, then return false.
    const dummy = Buffer.alloc(bBuf.length);
    timingSafeEqual(dummy, bBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Validate the Authorization header on an incoming request.
 * Pure function over request headers — no side effects, no logging here
 * (caller handles log + response so remote_addr + trustProxy policy stay
 * in the transport layer).
 */
export function validateBearer(req: IncomingMessage, expected: string): AuthResult {
  const presented = extractBearer(req.headers.authorization);
  if (presented === undefined) return { ok: false, reason: 'missing' };
  if (!constantTimeEqual(presented, expected)) return { ok: false, reason: 'invalid' };
  return { ok: true };
}

/**
 * Boot-time validation helper. Called from the CLI / server startup.
 * Returns an error string or null.
 */
export function checkAuthTokenAtBoot(token: string | undefined): string | null {
  if (!token || token.length === 0) {
    return 'AUTH_TOKEN_REQUIRED: --transport http requires --auth-token or MAAD_AUTH_TOKEN';
  }
  return null;
}

/**
 * Boot-time warning helper. Short tokens are not rejected (dev convenience)
 * but are logged as a warning so operators notice.
 */
export function shortTokenWarning(token: string): string | null {
  if (token.length < 16) {
    return `MAAD_AUTH_TOKEN is only ${token.length} chars; production deployments should use >=32 bytes (>=43 chars base64url). Allowed for dev convenience.`;
  }
  return null;
}
