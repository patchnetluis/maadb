// ============================================================================
// Field Extractor
// Extracts indexed frontmatter fields as ExtractedObject entries.
// ============================================================================

import type {
  BoundDocument,
  SchemaDefinition,
  ExtractedObject,
  Primitive,
  FieldType,
} from '../types.js';
import { normalize } from './normalizers.js';

const FIELD_TYPE_TO_PRIMITIVE: Partial<Record<FieldType, Primitive>> = {
  date: 'date',
  amount: 'amount',
  number: 'quantity',
};

export function extractFields(
  bound: BoundDocument,
  schema: SchemaDefinition,
): ExtractedObject[] {
  const objects: ExtractedObject[] = [];

  for (const [name, field] of Object.entries(bound.validatedFields)) {
    if (!field.indexed) continue;
    if (field.value === undefined || field.value === null) continue;

    const primitive = FIELD_TYPE_TO_PRIMITIVE[field.fieldType] ?? 'entity';
    // gray-matter parses date strings as JS Date objects — convert back to ISO
    const valueStr = field.value instanceof Date
      ? field.value.toISOString().slice(0, 10)
      : String(field.value);
    const normalizedValue = normalize(primitive, valueStr);

    objects.push({
      primitive,
      subtype: name,
      value: valueStr,
      normalizedValue,
      label: valueStr,
      role: field.role,
      docId: bound.docId,
      location: { file: bound.parsed.filePath, line: 1, col: 0 },
      blockId: null,
    });
  }

  return objects;
}
