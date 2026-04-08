// ============================================================================
// MCP Config — runtime configuration for the server
// Single source of truth for project root, role, flags.
// ============================================================================

import { parseRole, type Role } from './roles.js';

export interface McpConfig {
  projectRoot: string;
  role: Role;
  dryRun: boolean;
  toolAllowlist: string[];
}

export function buildConfig(opts: {
  projectRoot: string;
  role?: string | undefined;
  dryRun?: boolean | undefined;
  toolAllowlist?: string[] | undefined;
}): McpConfig {
  return {
    projectRoot: opts.projectRoot,
    role: parseRole(opts.role),
    dryRun: opts.dryRun ?? false,
    toolAllowlist: opts.toolAllowlist ?? [],
  };
}
