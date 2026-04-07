// ============================================================================
// Read tools — maad.get, maad.query, maad.search, maad.related, maad.schema
// ============================================================================

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MaadEngine } from '../../engine.js';
import { docId, docType, type ObjectQuery } from '../../types.js';
import { resultToResponse } from '../response.js';

export function register(server: McpServer, engine: MaadEngine): void {
  server.registerTool('maad.get', {
    description: 'Reads a markdown-backed record at increasing depth: hot (frontmatter), warm (+block), cold (full body), full (resolved refs+objects+related, provisional composite).',
    inputSchema: z.object({
      docId: z.string().describe('Document ID to read'),
      depth: z.enum(['hot', 'warm', 'cold', 'full']).default('hot')
        .describe('hot=frontmatter, warm=+block, cold=full body, full=resolved refs+objects+related'),
      block: z.string().optional().describe('Block ID or heading (warm depth only)'),
    }),
  }, async (args) => {
    if (args.depth === 'full') {
      return resultToResponse(await engine.getDocumentFull(docId(args.docId)));
    }
    return resultToResponse(await engine.getDocument(docId(args.docId), args.depth, args.block ?? undefined));
  });

  server.registerTool('maad.query', {
    description: 'Finds documents by type and optional field filters.',
    inputSchema: z.object({
      docType: z.string().describe('Document type to query'),
      filters: z.any().optional().describe('Field filters: { fieldName: { op, value } }'),
      limit: z.number().optional().describe('Max results'),
      offset: z.number().optional().describe('Skip first N results'),
    }),
  }, (args) => {
    const query: import('../../types.js').DocumentQuery = { docType: docType(args.docType) };
    if (args.filters !== undefined) query.filters = args.filters as any;
    if (args.limit !== undefined) query.limit = args.limit;
    if (args.offset !== undefined) query.offset = args.offset;
    return resultToResponse(engine.findDocuments(query));
  });

  server.registerTool('maad.search', {
    description: 'Searches extracted objects across all documents by primitive, subtype, value, or containing text. Use docId to scope to a single document.',
    inputSchema: z.object({
      primitive: z.string().describe('Extraction primitive (entity, date, amount, etc.)'),
      subtype: z.string().optional().describe('Subtype filter (person, org, attorney, etc.)'),
      value: z.string().optional().describe('Exact value match'),
      contains: z.string().optional().describe('Substring match on values'),
      docId: z.string().optional().describe('Scope search to a single document'),
      limit: z.number().optional().describe('Max results'),
      offset: z.number().optional().describe('Skip first N results'),
    }),
  }, (args) => {
    const query: ObjectQuery = { primitive: args.primitive as any };
    if (args.subtype !== undefined) query.subtype = args.subtype;
    if (args.value !== undefined) query.value = args.value;
    if (args.contains !== undefined) query.contains = args.contains;
    if (args.docId !== undefined) query.docId = docId(args.docId);
    if (args.limit !== undefined) query.limit = args.limit;
    if (args.offset !== undefined) query.offset = args.offset;
    return resultToResponse(engine.searchObjects(query));
  });

  server.registerTool('maad.related', {
    description: 'Returns documents connected to a given doc via ref fields.',
    inputSchema: z.object({
      docId: z.string().describe('Document ID'),
      direction: z.enum(['outgoing', 'incoming', 'both']).default('both')
        .describe('outgoing=docs this references, incoming=docs that reference this, both=all'),
    }),
  }, (args) => {
    return resultToResponse(engine.listRelated(docId(args.docId), args.direction));
  });

  server.registerTool('maad.schema', {
    description: 'Returns field definitions, required fields, and enum values for a type. Use before create/update to know what fields to pass.',
    inputSchema: z.object({
      docType: z.string().describe('Document type'),
    }),
  }, (args) => {
    return resultToResponse(engine.schemaInfo(docType(args.docType)));
  });
}
