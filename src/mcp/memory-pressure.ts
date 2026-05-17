// ============================================================================
// Memory Pressure Watcher — periodic V8 heap-usage sampler.
//
// Samples process.memoryUsage().heapUsed against v8.getHeapStatistics()
// heap_size_limit on an interval and emits a degraded-severity log event
// when the ratio passes a configured threshold. Pure observability — never
// mutates engine state, never throws, never blocks shutdown.
//
// Background: cgroup-capped deployments (e.g. 512 MiB container on Node 24)
// trip V8's auto-calibrated old-space cap at ~253 MB heap_size_limit. Without
// this surface, the only signal that a process is approaching the cap is
// post-mortem (exitCode=134 with "Reached heap limit"). The watcher gives
// operators a pre-OOM warning + a counter in maad_health.
//
// Disabled when intervalMs <= 0 (set MAAD_MEMORY_PRESSURE_INTERVAL_MS=0).
// Cooldown prevents log spam under sustained pressure — one fire per
// cooldown window while the ratio stays above threshold; the first sample
// below threshold re-arms the edge trigger.
// ============================================================================

import v8 from 'node:v8';
import { logger } from '../engine/logger.js';

export interface MemoryPressureOptions {
  intervalMs: number;
  thresholdRatio: number;
  cooldownMs: number;
  sampler?: Sampler;
  now?: () => number;
}

export interface MemoryPressureSnapshot {
  enabled: boolean;
  intervalMs: number;
  thresholdRatio: number;
  lastSampleAt: string | null;
  heapUsedMb: number | null;
  heapCapMb: number | null;
  ratio: number | null;
  inPressure: boolean;
  lastPressureAt: string | null;
  pressureFiresTotal: number;
}

export type Sampler = () => { heapUsedBytes: number; heapCapBytes: number };

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_THRESHOLD_RATIO = 0.8;
const DEFAULT_COOLDOWN_MS = 5 * 60_000;

const defaultSampler: Sampler = () => {
  const stats = v8.getHeapStatistics();
  return {
    heapUsedBytes: stats.used_heap_size,
    heapCapBytes: stats.heap_size_limit,
  };
};

interface WatcherState {
  intervalMs: number;
  thresholdRatio: number;
  cooldownMs: number;
  sampler: Sampler;
  now: () => number;
  timer: NodeJS.Timeout | null;
  lastSampleAtMs: number | null;
  heapUsedBytes: number | null;
  heapCapBytes: number | null;
  inPressure: boolean;
  lastPressureAtMs: number | null;
  lastFireAtMs: number | null;
  pressureFiresTotal: number;
}

const state: WatcherState = {
  intervalMs: 0,
  thresholdRatio: DEFAULT_THRESHOLD_RATIO,
  cooldownMs: DEFAULT_COOLDOWN_MS,
  sampler: defaultSampler,
  now: () => Date.now(),
  timer: null,
  lastSampleAtMs: null,
  heapUsedBytes: null,
  heapCapBytes: null,
  inPressure: false,
  lastPressureAtMs: null,
  lastFireAtMs: null,
  pressureFiresTotal: 0,
};

export function readMemoryPressureEnv(): MemoryPressureOptions {
  const intervalMs = parseNumericEnv(process.env.MAAD_MEMORY_PRESSURE_INTERVAL_MS, DEFAULT_INTERVAL_MS);
  const rawThreshold = parseNumericEnv(process.env.MAAD_MEMORY_PRESSURE_RATIO, DEFAULT_THRESHOLD_RATIO);
  const cooldownMs = parseNumericEnv(process.env.MAAD_MEMORY_PRESSURE_COOLDOWN_MS, DEFAULT_COOLDOWN_MS);
  const thresholdRatio = clamp(rawThreshold, 0, 1);
  return { intervalMs, thresholdRatio, cooldownMs };
}

function parseNumericEnv(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function initMemoryPressureWatcher(opts: MemoryPressureOptions): void {
  stopMemoryPressureWatcher();
  state.intervalMs = opts.intervalMs;
  state.thresholdRatio = clamp(opts.thresholdRatio, 0, 1);
  state.cooldownMs = Math.max(0, opts.cooldownMs);
  state.sampler = opts.sampler ?? defaultSampler;
  state.now = opts.now ?? (() => Date.now());
  state.lastSampleAtMs = null;
  state.heapUsedBytes = null;
  state.heapCapBytes = null;
  state.inPressure = false;
  state.lastPressureAtMs = null;
  state.lastFireAtMs = null;
  state.pressureFiresTotal = 0;
  if (opts.intervalMs <= 0) return;
  const timer = setInterval(sampleOnce, opts.intervalMs);
  timer.unref();
  state.timer = timer;
}

export function stopMemoryPressureWatcher(): void {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
}

/**
 * Run one sample. Public so tests and shutdown paths can probe without
 * waiting for the interval to fire. Never throws.
 */
export function sampleOnce(): void {
  let sample: { heapUsedBytes: number; heapCapBytes: number };
  try {
    sample = state.sampler();
  } catch {
    return;
  }
  const nowMs = state.now();
  state.lastSampleAtMs = nowMs;
  state.heapUsedBytes = sample.heapUsedBytes;
  state.heapCapBytes = sample.heapCapBytes;
  if (sample.heapCapBytes <= 0) return;
  const ratio = sample.heapUsedBytes / sample.heapCapBytes;
  if (ratio >= state.thresholdRatio) {
    const cooldownPassed = state.lastFireAtMs === null
      || (nowMs - state.lastFireAtMs) >= state.cooldownMs;
    const edgeTrigger = !state.inPressure;
    if (edgeTrigger || cooldownPassed) {
      logger.degraded(
        'engine',
        'memory_pressure',
        `V8 heap at ${formatPct(ratio)}% of cap (${bytesToMb(sample.heapUsedBytes)}MB / ${bytesToMb(sample.heapCapBytes)}MB)`,
        {
          heap_used_mb: bytesToMb(sample.heapUsedBytes),
          heap_cap_mb: bytesToMb(sample.heapCapBytes),
          ratio: round3(ratio),
          threshold_ratio: state.thresholdRatio,
          edge: edgeTrigger,
        },
      );
      state.pressureFiresTotal++;
      state.lastFireAtMs = nowMs;
      state.lastPressureAtMs = nowMs;
    }
    state.inPressure = true;
  } else {
    state.inPressure = false;
  }
}

export function getMemoryPressureSnapshot(): MemoryPressureSnapshot {
  const heapUsed = state.heapUsedBytes;
  const heapCap = state.heapCapBytes;
  const ratio = heapUsed !== null && heapCap !== null && heapCap > 0
    ? round3(heapUsed / heapCap) : null;
  return {
    enabled: state.intervalMs > 0,
    intervalMs: state.intervalMs,
    thresholdRatio: state.thresholdRatio,
    lastSampleAt: state.lastSampleAtMs !== null ? new Date(state.lastSampleAtMs).toISOString() : null,
    heapUsedMb: heapUsed !== null ? bytesToMb(heapUsed) : null,
    heapCapMb: heapCap !== null ? bytesToMb(heapCap) : null,
    ratio,
    inPressure: state.inPressure,
    lastPressureAt: state.lastPressureAtMs !== null ? new Date(state.lastPressureAtMs).toISOString() : null,
    pressureFiresTotal: state.pressureFiresTotal,
  };
}

/**
 * Test hook — resets module state. Never call from production code.
 */
export function __resetMemoryPressureForTests(): void {
  stopMemoryPressureWatcher();
  state.intervalMs = 0;
  state.thresholdRatio = DEFAULT_THRESHOLD_RATIO;
  state.cooldownMs = DEFAULT_COOLDOWN_MS;
  state.sampler = defaultSampler;
  state.now = () => Date.now();
  state.lastSampleAtMs = null;
  state.heapUsedBytes = null;
  state.heapCapBytes = null;
  state.inPressure = false;
  state.lastPressureAtMs = null;
  state.lastFireAtMs = null;
  state.pressureFiresTotal = 0;
}

function bytesToMb(b: number): number {
  return Math.round((b / 1024 / 1024) * 10) / 10;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function formatPct(ratio: number): string {
  return (ratio * 100).toFixed(1);
}

function clamp(n: number, lo: number, hi: number): number {
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}
