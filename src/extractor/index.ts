// ============================================================================
// Extractor — Public API
// Combines field extraction, annotation object extraction, and relationships.
// ============================================================================

import type {
  BoundDocument,
  SchemaDefinition,
  ExtractionResult,
  Registry,
} from '../types.js';
import { extractFields } from './fields.js';
import { extractAnnotationObjects } from './objects.js';
import { extractRelationships } from './relationships.js';

export { normalize } from './normalizers.js';
export { extractFields } from './fields.js';
export { extractAnnotationObjects } from './objects.js';
export { extractRelationships } from './relationships.js';

export function extract(
  bound: BoundDocument,
  schema: SchemaDefinition,
  registry: Registry,
): ExtractionResult {
  const fieldObjects = extractFields(bound, schema);
  const annotationObjects = extractAnnotationObjects(bound, bound.parsed.annotations);
  const relationships = extractRelationships(bound, schema, bound.parsed.annotations, registry);

  return {
    document: bound,
    objects: [...fieldObjects, ...annotationObjects],
    relationships,
  };
}
