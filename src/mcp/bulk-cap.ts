// ============================================================================
// Bulk-tool item-count cap (0.7.3, fup-2026-190 §1).
//
// Defense-in-depth flood control for maad_bulk_create / maad_bulk_update.
// Independent of per-session write rate limits — those throttle frequency,
// this caps per-request blast radius. Also bounds memory cost of bulk results
// (per-record validation reports, audit events, notification fanouts).
//
// Default cap: 50. Configurable via MAAD_BULK_MAX_ITEMS, clamped to [1, 1000]
// to keep the floor meaningful even under operator misconfiguration.
// ============================================================================

const DEFAULT_BULK_MAX = 50;
const HARD_BULK_MAX = 1000;

export function getBulkMaxItems(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.MAAD_BULK_MAX_ITEMS;
  if (!raw) return DEFAULT_BULK_MAX;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_BULK_MAX;
  if (n > HARD_BULK_MAX) return HARD_BULK_MAX;
  return n;
}

export interface BulkCapRejection {
  tool: string;
  received: number;
  limit: number;
  suggestedChunkSize: number;
  message: string;
}

export function checkBulkSize(
  toolName: string,
  count: number,
  env: NodeJS.ProcessEnv = process.env,
): BulkCapRejection | null {
  const max = getBulkMaxItems(env);
  if (count <= max) return null;
  return {
    tool: toolName,
    received: count,
    limit: max,
    suggestedChunkSize: max,
    message: `${toolName} accepts at most ${max} items per call (received ${count}). Split into chunks of <= ${max}.`,
  };
}
