// ============================================================================
// MCP Response Contract — standard { ok, data|errors } shape for all tools
// ============================================================================

import type { Result, MaadError } from '../errors.js';

interface SuccessResponse {
  ok: true;
  data: unknown;
}

interface ErrorResponse {
  ok: false;
  errors: Array<{ code: string; message: string }>;
}

type McpResponse = SuccessResponse | ErrorResponse;

export function successResponse(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  const response: McpResponse = { ok: true, data };
  return { content: [{ type: 'text', text: JSON.stringify(response) }] };
}

export function errorResponse(errors: MaadError[]): { content: Array<{ type: 'text'; text: string }> } {
  const response: McpResponse = {
    ok: false,
    errors: errors.map(e => ({ code: e.code, message: e.message })),
  };
  return { content: [{ type: 'text', text: JSON.stringify(response) }] };
}

export function resultToResponse<T>(result: Result<T>): { content: Array<{ type: 'text'; text: string }> } {
  if (result.ok) return successResponse(result.value);
  return errorResponse(result.errors);
}
