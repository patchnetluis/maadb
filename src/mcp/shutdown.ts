// ============================================================================
// Shutdown state machine — running → draining → exiting.
//
// SIGTERM / SIGINT trigger DRAINING. New tool calls are rejected at the
// `withEngine` entry with SHUTTING_DOWN. In-flight writes are given a bounded
// window to complete (MAAD_SHUTDOWN_TIMEOUT_MS, default 10s). After drain or
// timeout, EXITING closes engines, flushes audit, and process.exit(code).
//
// Second signal during DRAINING skips the wait and force-exits.
//
// Cooperative cancellation *inside* engine methods (AbortSignal threaded
// through stage boundaries) is deferred to 0.8.5 and documented in gaps.md.
// For 0.4.1: requests already executing run to completion; the drain waits
// for them; clients see either their response or REQUEST_TIMEOUT if the
// per-request ceiling was first.
// ============================================================================

import type { EnginePool } from '../instance/pool.js';
import type { SessionRateLimiter } from './rate-limit.js';
import { getOpsLog } from '../logging.js';

export type ShutdownState = 'running' | 'draining' | 'exiting';

export interface DrainTarget {
  pool: EnginePool;
  rateLimiter: SessionRateLimiter;
}

export interface ShutdownOptions {
  shutdownTimeoutMs?: number;
  // Injectable exit hook — tests can capture exit codes without actually
  // calling process.exit.
  exit?: (code: number) => void;
  // Injectable signal-handler installer — tests skip real signals.
  installHandlers?: boolean;
  // Extra cleanup to run during EXITING after engines close (e.g. server.close).
  finalCleanup?: () => Promise<void>;
}

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;
const DRAIN_POLL_MS = 50;

let state: ShutdownState = 'running';
let shutdownStartedAt: number | null = null;
let shutdownPromise: Promise<void> | null = null;

export function getShutdownState(): ShutdownState {
  return state;
}

export function isShuttingDown(): boolean {
  return state !== 'running';
}

/**
 * Test hook — resets module state. NEVER call from production code.
 */
export function __resetShutdownState(): void {
  state = 'running';
  shutdownStartedAt = null;
  shutdownPromise = null;
}

/**
 * Begin shutdown. First call flips state to 'draining' and starts the drain
 * loop. Second call short-circuits the wait and accelerates to exiting.
 * Third+ calls are ignored.
 */
export function beginShutdown(
  target: DrainTarget,
  opts: ShutdownOptions = {},
): Promise<void> {
  const log = getOpsLog();

  if (state === 'exiting') {
    // Already on the way out — nothing to do.
    return shutdownPromise ?? Promise.resolve();
  }

  if (state === 'draining') {
    // Second signal: accelerate.
    log.warn({ event: 'shutdown_forced' }, 'shutdown_forced');
    state = 'exiting';
    // The existing shutdownPromise will observe the state change and finalize.
    return shutdownPromise ?? Promise.resolve();
  }

  // First signal: start draining.
  state = 'draining';
  shutdownStartedAt = Date.now();
  log.info({ event: 'shutdown_start' }, 'shutdown_start');

  const exitFn = opts.exit ?? ((code: number) => process.exit(code));
  const timeoutMs = opts.shutdownTimeoutMs ?? Number(process.env.MAAD_SHUTDOWN_TIMEOUT_MS ?? DEFAULT_SHUTDOWN_TIMEOUT_MS);

  shutdownPromise = (async () => {
    let drainTimedOut = false;
    const deadline = Date.now() + timeoutMs;

    // Drain loop: wait until no writes are queued AND no requests are in flight
    // OR the grace window expires, OR a second signal accelerates.
    while (true) {
      const queueDepth = target.pool.totalWriteQueueDepth();
      const inFlight = target.rateLimiter.totalInFlight();
      if (queueDepth === 0 && inFlight === 0) break;
      if ((state as ShutdownState) === 'exiting') break; // accelerated by a second signal
      if (Date.now() >= deadline) {
        drainTimedOut = true;
        log.warn({
          event: 'shutdown_timeout',
          queue_depth: queueDepth,
          in_flight: inFlight,
          elapsed_ms: Date.now() - (shutdownStartedAt ?? Date.now()),
        }, 'shutdown_timeout');
        break;
      }
      await sleep(DRAIN_POLL_MS);
    }

    state = 'exiting';

    // EXITING: final cleanup.
    try {
      await target.pool.closeAll();
    } catch {
      // best-effort
    }
    if (opts.finalCleanup) {
      try {
        await opts.finalCleanup();
      } catch {
        // best-effort
      }
    }

    const elapsedMs = Date.now() - (shutdownStartedAt ?? Date.now());
    log.info({
      event: 'shutdown_complete',
      elapsed_ms: elapsedMs,
      drain_timed_out: drainTimedOut,
    }, 'shutdown_complete');

    // Exit code 1 on timed-out drain; 0 on clean drain. Surfaces to operators
    // monitoring container exit codes.
    exitFn(drainTimedOut ? 1 : 0);
  })();

  return shutdownPromise;
}

/**
 * Install SIGTERM / SIGINT handlers that call beginShutdown on first hit and
 * accelerate on the second. Call once from server startup. Tests bypass this
 * by installing their own handlers or calling beginShutdown directly.
 */
export function installSignalHandlers(target: DrainTarget, opts: ShutdownOptions = {}): void {
  const onSignal = (sig: string) => {
    const log = getOpsLog();
    log.info({ event: 'signal_received', signal: sig }, 'signal_received');
    void beginShutdown(target, opts);
  };
  process.on('SIGTERM', () => onSignal('SIGTERM'));
  process.on('SIGINT', () => onSignal('SIGINT'));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
