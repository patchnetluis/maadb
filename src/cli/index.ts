#!/usr/bin/env node
// ============================================================================
// MAAD CLI — Command dispatch
// ============================================================================

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CliContext } from './helpers.js';
import { cmdScan, cmdSummary, cmdDescribe } from './commands/discover.js';
import { cmdGet, cmdQuery, cmdSearch, cmdRelated, cmdSchema } from './commands/read.js';
import { cmdCreate, cmdUpdate } from './commands/write.js';
import { cmdInit, cmdValidate, cmdReindex, cmdParse } from './commands/maintain.js';
import { cmdHistory, cmdAudit } from './commands/audit.js';
import { startServer } from '../mcp/server.js';
import { checkAuthTokenAtBoot, shortTokenWarning } from '../mcp/transport/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse --project / --instance flags (env vars MAAD_PROJECT / MAAD_INSTANCE as fallbacks).
// --project and --instance are mutually exclusive. If neither is supplied, `serve` errors out;
// other commands still default --project to cwd for backward compatibility.
const rawArgs = process.argv.slice(2);
let projectRoot = process.env['MAAD_PROJECT'];
let instancePath: string | undefined = process.env['MAAD_INSTANCE'];
const args: string[] = [];

for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i] === '--project' && rawArgs[i + 1]) {
    projectRoot = rawArgs[i + 1]!;
    i++;
  } else if (rawArgs[i] === '--instance' && rawArgs[i + 1]) {
    instancePath = rawArgs[i + 1]!;
    i++;
  } else {
    args.push(rawArgs[i]!);
  }
}

if (projectRoot && instancePath) {
  console.error('Error: --project and --instance are mutually exclusive.');
  process.exit(1);
}

// Non-serve commands still need a default project when neither flag is set.
if (!projectRoot && !instancePath) projectRoot = '.';

const ctx: CliContext = { args, projectRoot: projectRoot ?? '.', __dirname };
const command = args[0];

async function main(): Promise<void> {
  switch (command) {
    // Discover
    case 'scan':      await cmdScan(ctx); break;
    case 'summary':   await cmdSummary(ctx); break;
    case 'describe':  await cmdDescribe(ctx); break;
    // Read
    case 'get':       await cmdGet(ctx); break;
    case 'query':     await cmdQuery(ctx); break;
    case 'search':    await cmdSearch(ctx); break;
    case 'related':   await cmdRelated(ctx); break;
    case 'schema':    await cmdSchema(ctx); break;
    // Write
    case 'create':    await cmdCreate(ctx); break;
    case 'update':    await cmdUpdate(ctx); break;
    // Maintain
    case 'init':      await cmdInit(ctx); break;
    case 'validate':  await cmdValidate(ctx); break;
    case 'reindex':   await cmdReindex(ctx); break;
    case 'parse':     await cmdParse(ctx); break;
    // Audit
    case 'history':   await cmdHistory(ctx); break;
    case 'audit':     await cmdAudit(ctx); break;
    // MCP
    case 'serve':
      await cmdServe();
      break;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

function parseIntEnv(val: string | undefined, fallback: number): number {
  if (val === undefined || val === '') return fallback;
  const n = Number.parseInt(val, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function cmdServe(): Promise<void> {
  let role: string | undefined = process.env['MAAD_ROLE'];
  let dryRun = false;
  let provenance: string | undefined = process.env['MAAD_PROV'];
  let transport: 'stdio' | 'http' = (process.env['MAAD_TRANSPORT'] as 'stdio' | 'http' | undefined) ?? 'stdio';
  let httpHost: string = process.env['MAAD_HTTP_HOST'] ?? '127.0.0.1';
  let httpPort: number = parseIntEnv(process.env['MAAD_HTTP_PORT'], 7733);
  let httpMaxBody: number = parseIntEnv(process.env['MAAD_HTTP_MAX_BODY'], 1_048_576);
  let headersTimeoutMs: number = parseIntEnv(process.env['MAAD_HTTP_HEADERS_TIMEOUT_MS'], 10_000);
  let requestTimeoutMs: number = parseIntEnv(process.env['MAAD_HTTP_REQUEST_TIMEOUT_MS'], 60_000);
  let keepAliveTimeoutMs: number = parseIntEnv(process.env['MAAD_HTTP_KEEPALIVE_TIMEOUT_MS'], 5_000);
  let idleMs: number = parseIntEnv(process.env['MAAD_SESSION_IDLE_MS'], 1_800_000);
  let trustProxy: boolean = process.env['MAAD_TRUST_PROXY'] === '1' || process.env['MAAD_TRUST_PROXY'] === 'true';
  let authToken: string | undefined = process.env['MAAD_AUTH_TOKEN'];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = args[i + 1];
    if (a === '--role' && next) role = next;
    else if (a === '--dry-run') dryRun = true;
    else if (a === '--prov' && next) provenance = next;
    else if (a === '--transport' && next) transport = next as 'stdio' | 'http';
    else if (a === '--http-host' && next) httpHost = next;
    else if (a === '--http-port' && next) httpPort = parseIntEnv(next, httpPort);
    else if (a === '--http-max-body' && next) httpMaxBody = parseIntEnv(next, httpMaxBody);
    else if (a === '--http-headers-timeout' && next) headersTimeoutMs = parseIntEnv(next, headersTimeoutMs);
    else if (a === '--http-request-timeout' && next) requestTimeoutMs = parseIntEnv(next, requestTimeoutMs);
    else if (a === '--http-keepalive-timeout' && next) keepAliveTimeoutMs = parseIntEnv(next, keepAliveTimeoutMs);
    else if (a === '--session-idle-ms' && next) idleMs = parseIntEnv(next, idleMs);
    else if (a === '--trust-proxy') trustProxy = true;
    else if (a === '--auth-token' && next) authToken = next;
  }

  if (transport !== 'stdio' && transport !== 'http') {
    console.error(`Error: --transport must be 'stdio' or 'http' (got '${transport}')`);
    process.exit(1);
  }

  if (transport === 'http') {
    const err = checkAuthTokenAtBoot(authToken);
    if (err) {
      console.error(`Error: ${err}`);
      process.exit(1);
    }
    const warn = shortTokenWarning(authToken!);
    if (warn) console.error(`Warning: ${warn}`);
  }

  const base = {
    role,
    dryRun,
    provenance,
    transport,
    ...(transport === 'http' ? {
      http: {
        host: httpHost,
        port: httpPort,
        maxBodyBytes: httpMaxBody,
        headersTimeoutMs,
        requestTimeoutMs,
        keepAliveTimeoutMs,
        trustProxy,
        idleMs,
        authToken,
      },
    } : {}),
  } as const;

  if (instancePath) {
    await startServer({ ...base, instancePath: path.resolve(instancePath) });
  } else if (projectRoot) {
    await startServer({ ...base, projectRoot: path.resolve(projectRoot) });
  } else {
    console.error('Error: `serve` requires --project <dir> or --instance <path>.');
    process.exit(1);
  }
}

function printHelp(): void {
  console.log(`
MAAD — Markdown As A Database

Usage: maad <command> [options]

Commands:
  init [dir]                        Initialize a new MAAD project
  scan <file.md|dir>                 Analyze raw markdown (no registry needed)
  summary                           Project snapshot (types, counts, sample IDs, object inventory)
  describe                          Show project overview
  get <doc_id> [depth] [block]      Read a document (hot/warm/cold/full)
  query <type> [--filter k=v]       Find documents by type and filters
  search <primitive> [opts]         Search extracted objects (--subtype, --value, --contains, --doc)
  related <doc_id> [direction]      Show related documents
  schema <type>                     Show field definitions for a type (for writes)
  create <type> --field k=v [...]   Create a new document
  update <doc_id> --field k=v [...] Update a document's fields or body
  validate [doc_id]                 Validate one or all documents
  reindex [--force]                 Rebuild the index from markdown
  parse <file.md>                   Parse a file and print the result
  history <doc_id>                  Show git history for a document
  audit [--since date]              Show project-wide activity
  serve [--transport stdio|http] [--role ...] [--prov ...]  Start MCP server

Options:
  --project <dir>                   Single-project mode (default for CLI cmds: cwd)
  --instance <path>                 Multi-project mode: path to instance.yaml (serve only)
  --role <role>                     MCP server role in single-project mode (default: reader)
  --force                           Force full reindex (skip hash check)
  --help                            Show this help

serve HTTP options (when --transport http):
  --transport <stdio|http>          Transport selection (default: stdio)
  --http-host <host>                Bind address (default: 127.0.0.1)
  --http-port <port>                Bind port (default: 7733)
  --auth-token <token>              Bearer token (required for http; prefer MAAD_AUTH_TOKEN env)
  --http-max-body <bytes>           Max request body bytes (default: 1048576)
  --http-headers-timeout <ms>       node:http headersTimeout (default: 10000)
  --http-request-timeout <ms>       node:http requestTimeout (default: 60000)
  --http-keepalive-timeout <ms>     node:http keepAliveTimeout (default: 5000)
  --session-idle-ms <ms>            Per-session idle eviction threshold (default: 1800000 = 30 min)
  --trust-proxy                     Use X-Forwarded-For first hop for remote IP in logs

Environment Variables:
  MAAD_PROJECT                      Project root (fallback for --project)
  MAAD_INSTANCE                     Path to instance.yaml (fallback for --instance)
  MAAD_ROLE                         Server role (fallback for --role)
  MAAD_PROV                         Provenance mode (fallback for --prov)
  MAAD_TRANSPORT                    stdio | http (default: stdio)
  MAAD_HTTP_HOST                    HTTP bind host (default: 127.0.0.1)
  MAAD_HTTP_PORT                    HTTP bind port (default: 7733)
  MAAD_AUTH_TOKEN                   Bearer token for HTTP transport (required for http)
  MAAD_SESSION_IDLE_MS              Per-session idle eviction threshold (default: 1800000)
  MAAD_HTTP_MAX_BODY                HTTP max body bytes (default: 1048576)
  MAAD_HTTP_HEADERS_TIMEOUT_MS      headersTimeout ms (default: 10000)
  MAAD_HTTP_REQUEST_TIMEOUT_MS      requestTimeout ms (default: 60000)
  MAAD_HTTP_KEEPALIVE_TIMEOUT_MS    keepAliveTimeout ms (default: 5000)
  MAAD_TRUST_PROXY                  1|true to trust X-Forwarded-For (default: false)
`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
