// ============================================================================
// CLI auth subcommands — 0.7.0 Scoped Auth & Identity (P3)
//
//   maad auth issue-token   --role=... --projects=... [--name] [--agent]
//                            [--user] [--expires]
//   maad auth revoke-token  --id=tok-...
//   maad auth rotate-token  --id=tok-...
//   maad auth list-tokens   [--include-revoked]
//   maad auth show-token    --id=tok-...
//
// All commands operate on `<instance-root>/_auth/tokens.yaml`. Requires
// --instance (or MAAD_INSTANCE env) — synthetic single-project mode has no
// token registry. Plaintext is printed ONCE to stdout at issue/rotate time
// and never again recoverable from the registry.
// ============================================================================

import path from 'node:path';
import { loadInstance } from '../../instance/config.js';
import { TokenStore } from '../../auth/token-store.js';
import type { IssueSpec, ProjectCap } from '../../auth/types.js';
import { tokenId } from '../../auth/types.js';
import type { Role } from '../../mcp/roles.js';

interface AuthCliOptions {
  instancePath: string | undefined;
  args: string[];
}

/** Shared dispatcher — called from the top-level CLI router. */
export async function cmdAuth(opts: AuthCliOptions): Promise<void> {
  const sub = opts.args[1];
  if (!sub) {
    printAuthHelp();
    return;
  }
  const store = await openStore(opts.instancePath);
  switch (sub) {
    case 'issue-token':  await cmdIssue(store, opts.args.slice(2)); break;
    case 'revoke-token': await cmdRevoke(store, opts.args.slice(2)); break;
    case 'rotate-token': await cmdRotate(store, opts.args.slice(2)); break;
    case 'list-tokens':  cmdList(store, opts.args.slice(2)); break;
    case 'show-token':   cmdShow(store, opts.args.slice(2)); break;
    case 'help':
    case '--help':
    case '-h':
      printAuthHelp();
      break;
    default:
      console.error(`Unknown auth subcommand: ${sub}`);
      printAuthHelp();
      process.exit(1);
  }
}

// --- Individual handlers ---------------------------------------------------

async function cmdIssue(store: TokenStore, args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const role = flags['role'];
  const projectsRaw = flags['projects'];
  if (!role || !projectsRaw) {
    console.error('Usage: maad auth issue-token --role=<reader|writer|admin> --projects=<csv-or-*> [--name=<label>] [--agent=<id>] [--user=<id>] [--expires=<iso>]');
    process.exit(1);
  }
  if (role !== 'reader' && role !== 'writer' && role !== 'admin') {
    console.error(`--role must be reader|writer|admin (got "${role}")`);
    process.exit(1);
  }
  const projects = parseProjects(projectsRaw);

  const spec: IssueSpec = { role: role as Role, projects };
  if (flags['name']) spec.name = flags['name'];
  if (flags['agent']) spec.agentId = flags['agent'];
  if (flags['user']) spec.userId = flags['user'];
  if (flags['expires']) spec.expiresAt = flags['expires'];

  const result = await store.issue(spec);
  if (!result.ok) {
    console.error('issue-token failed:');
    for (const e of result.errors) console.error(`  ${e.code}: ${e.message}`);
    process.exit(1);
  }
  // Plaintext on stdout ONCE; record metadata as structured stderr note so
  // scripts can `maad auth issue-token ... | tee -a client.token`.
  console.log(result.value.plaintext);
  console.error('\n⚠️  Store this token now — it will not be shown again.');
  console.error('Record:');
  console.error(JSON.stringify(result.value.record, null, 2));
}

async function cmdRevoke(store: TokenStore, args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const id = flags['id'];
  if (!id) {
    console.error('Usage: maad auth revoke-token --id=<tok-xxx>');
    process.exit(1);
  }
  const result = await store.revoke(tokenId(id));
  if (!result.ok) {
    console.error('revoke-token failed:');
    for (const e of result.errors) console.error(`  ${e.code}: ${e.message}`);
    process.exit(1);
  }
  console.log(JSON.stringify(result.value, null, 2));
}

async function cmdRotate(store: TokenStore, args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const id = flags['id'];
  if (!id) {
    console.error('Usage: maad auth rotate-token --id=<tok-xxx>');
    process.exit(1);
  }
  const result = await store.rotate(tokenId(id));
  if (!result.ok) {
    console.error('rotate-token failed:');
    for (const e of result.errors) console.error(`  ${e.code}: ${e.message}`);
    process.exit(1);
  }
  console.log(result.value.plaintext);
  console.error('\n⚠️  Store this new token — old token is revoked and will not be shown again.');
  console.error('New record:');
  console.error(JSON.stringify(result.value.record, null, 2));
}

function cmdList(store: TokenStore, args: string[]): void {
  const flags = parseFlags(args);
  const includeRevoked = flags['include-revoked'] !== undefined;
  const list = store.list().filter(r => includeRevoked || r.revokedAt === undefined);
  // Strip the hash from listing output — consumers never need to see it.
  const sanitized = list.map(r => { const { hash, ...rest } = r; void hash; return rest; });
  console.log(JSON.stringify(sanitized, null, 2));
}

function cmdShow(store: TokenStore, args: string[]): void {
  const flags = parseFlags(args);
  const id = flags['id'];
  if (!id) {
    console.error('Usage: maad auth show-token --id=<tok-xxx>');
    process.exit(1);
  }
  const record = store.lookupById(tokenId(id));
  if (!record) {
    console.error(`show-token: TOKEN_NOT_FOUND: No token with id ${id}`);
    process.exit(1);
  }
  const { hash, ...rest } = record;
  void hash;
  console.log(JSON.stringify(rest, null, 2));
}

// --- Helpers ---------------------------------------------------------------

async function openStore(instancePath: string | undefined): Promise<TokenStore> {
  if (!instancePath) {
    console.error('auth commands require --instance <path> (or MAAD_INSTANCE env)');
    console.error('Legacy --project single-project mode has no token registry.');
    process.exit(1);
  }
  // Validate the instance file exists + is parseable; we don't need the instance
  // itself but want a clean error if the operator pointed at a wrong path.
  const instance = await loadInstance(instancePath);
  if (!instance.ok) {
    console.error('Failed to load instance:');
    for (const e of instance.errors) console.error(`  ${e.code}: ${e.message}`);
    process.exit(1);
  }
  const instanceRoot = path.dirname(path.resolve(instancePath));
  const loaded = await TokenStore.load(instanceRoot);
  if (!loaded.ok) {
    console.error('Failed to load token registry:');
    for (const e of loaded.errors) console.error(`  ${e.code}: ${e.message}`);
    process.exit(1);
  }
  return loaded.value;
}

function parseFlags(args: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) {
        const key = a.slice(2, eq);
        const val = a.slice(eq + 1);
        out[key] = val;
      } else {
        const key = a.slice(2);
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          out[key] = next;
          i++;
        } else {
          out[key] = '';
        }
      }
    }
  }
  return out;
}

function parseProjects(raw: string): ProjectCap[] {
  return raw.split(',').map(s => s.trim()).filter(Boolean).map(entry => {
    // Support per-project role syntax: `proj-a:reader`
    const colon = entry.indexOf(':');
    if (colon > 0) {
      const name = entry.slice(0, colon);
      const role = entry.slice(colon + 1);
      if (role !== 'reader' && role !== 'writer' && role !== 'admin') {
        console.error(`Invalid per-project role "${role}" in --projects; expected reader|writer|admin`);
        process.exit(1);
      }
      return { name, role: role as Role };
    }
    return { name: entry };
  });
}

function printAuthHelp(): void {
  console.error(`maad auth — token registry operations

Subcommands:
  issue-token   --role=... --projects=... [--name] [--agent] [--user] [--expires]
  revoke-token  --id=tok-...
  rotate-token  --id=tok-...
  list-tokens   [--include-revoked]
  show-token    --id=tok-...

All commands require --instance <path> (or MAAD_INSTANCE env) pointing at the
instance config. Registry lives at <instance-root>/_auth/tokens.yaml.

Examples:
  maad --instance /etc/maad/instance.yaml auth issue-token \\
       --role=admin --name='brain-app-gateway' --projects='*' --agent=agt-brain-app

  maad --instance /etc/maad/instance.yaml auth issue-token \\
       --role=writer --projects='proj-a,proj-b:reader' --agent=agt-scoped

  maad --instance /etc/maad/instance.yaml auth rotate-token --id=tok-abc123
`);
}
