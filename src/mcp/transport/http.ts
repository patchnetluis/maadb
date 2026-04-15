// ============================================================================
// HTTP/SSE transport for MCP (0.5.0 R1 — transport scaffold, no auth yet)
//
// Creates a node:http server, routes /mcp POST/GET/DELETE through the SDK's
// StreamableHTTPServerTransport. One transport instance per session, stored
// in a session-keyed map. node:http timeouts are set explicitly (slowloris +
// hung-request defense). Response hardening headers injected on every response.
// Auth layers in R2, session registry fan-out in R3.
// ============================================================================

import { createServer as createHttpServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '../../engine/logger.js';

export interface HttpTransportOptions {
  host: string;
  port: number;
  maxBodyBytes: number;
  headersTimeoutMs: number;
  requestTimeoutMs: number;
  keepAliveTimeoutMs: number;
  trustProxy: boolean;
  /** Factory called once per new session to produce a fresh McpServer with tools registered. */
  serverFactory: () => McpServer;
}

export interface HttpTransportHandle {
  httpServer: HttpServer;
  close: () => Promise<void>;
  activeSessionCount: () => number;
}

function remoteAddrFor(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length > 0) return xff.split(',')[0]!.trim();
    if (Array.isArray(xff) && xff.length > 0) return xff[0]!.trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function writeJsonError(res: ServerResponse, status: number, code: string, message: string): void {
  if (!res.headersSent) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
  res.end(JSON.stringify({ ok: false, errors: [{ code, message }] }));
}

function applyResponseHardening(res: ServerResponse, kind: 'json' | 'sse'): void {
  // SDK emits Cache-Control: no-cache (or no-cache, no-transform) on SSE and some JSON paths.
  // We layer in no-store on JSON responses and nosniff on all responses.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (kind === 'json') {
    res.setHeader('Cache-Control', 'no-store');
  }
}

export async function startHttpTransport(opts: HttpTransportOptions): Promise<HttpTransportHandle> {
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createHttpServer(async (req, res) => {
    try {
      // Body-size pre-check via Content-Length. Streaming bypass is possible but
      // stretches the threat model — clients that chunk around this cap are
      // already hostile, and 0.5.0's rate limiter catches sustained abuse.
      const contentLength = Number.parseInt(req.headers['content-length'] ?? '0', 10);
      if (Number.isFinite(contentLength) && contentLength > opts.maxBodyBytes) {
        writeJsonError(res, 413, 'PAYLOAD_TOO_LARGE',
          `Request body exceeds ${opts.maxBodyBytes} bytes`);
        return;
      }

      const url = new URL(req.url ?? '/', `http://${opts.host}`);
      if (url.pathname !== '/mcp') {
        writeJsonError(res, 404, 'NOT_FOUND', 'Unknown path');
        return;
      }

      const sessionIdHeader = req.headers['mcp-session-id'];
      const sessionId = typeof sessionIdHeader === 'string' ? sessionIdHeader : undefined;

      // Existing session — route to its transport
      if (sessionId && transports.has(sessionId)) {
        const transport = transports.get(sessionId)!;
        applyResponseHardening(res, req.method === 'GET' ? 'sse' : 'json');
        await transport.handleRequest(req, res);
        return;
      }

      // Unknown session ID on non-initialize request — 404 (auth will add a 401 gate in R2)
      if (sessionId) {
        writeJsonError(res, 404, 'SESSION_NOT_FOUND', 'Unknown session');
        return;
      }

      // No session ID: must be POST for initialize
      if (req.method !== 'POST') {
        writeJsonError(res, 400, 'BAD_REQUEST', 'Mcp-Session-Id header required');
        return;
      }

      // New session: transport delegates ID generation to us (128-bit CSPRNG)
      const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomBytes(16).toString('base64url'),
        onsessioninitialized: (sid: string) => {
          transports.set(sid, transport);
          logger.info('mcp', 'http', `session opened sid=${sid} remote=${remoteAddrFor(req, opts.trustProxy)}`);
        },
      });
      transport.onclose = (): void => {
        const sid = transport.sessionId;
        if (sid && transports.has(sid)) {
          transports.delete(sid);
          logger.info('mcp', 'http', `session closed sid=${sid}`);
        }
      };

      const mcpServer = opts.serverFactory();
      // SDK's StreamableHTTPServerTransport declares onclose/onerror/onmessage
      // as optional, but Server.connect's Transport interface declares them
      // non-optional under exactOptionalPropertyTypes. Widening cast is the
      // least invasive workaround; the runtime shape is identical.
      await mcpServer.connect(transport as unknown as Parameters<typeof mcpServer.connect>[0]);

      applyResponseHardening(res, 'json');
      await transport.handleRequest(req, res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('mcp', 'http', `request error: ${msg}`);
      if (!res.headersSent) {
        writeJsonError(res, 500, 'INTERNAL', 'Internal server error');
      } else {
        try { res.end(); } catch { /* best-effort */ }
      }
    }
  });

  httpServer.headersTimeout = opts.headersTimeoutMs;
  httpServer.requestTimeout = opts.requestTimeoutMs;
  httpServer.keepAliveTimeout = opts.keepAliveTimeoutMs;

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(opts.port, opts.host, () => {
      httpServer.off('error', reject);
      resolve();
    });
  });

  logger.info('mcp', 'http', `Server started on http://${opts.host}:${opts.port}/mcp`);

  return {
    httpServer,
    activeSessionCount: () => transports.size,
    close: async () => {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      for (const t of transports.values()) {
        try { await t.close(); } catch { /* best-effort */ }
      }
      transports.clear();
    },
  };
}
