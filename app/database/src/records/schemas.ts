// Authored by Karter Whitman using Claude Sonnet 5
// Schemas: a type's field list, as data (types.ts). Created and edited
// from the schema manager, never through the Change model — like labels,
// there is nothing about one to undo, only the current shape of a type.
import { getDb } from "../db.js";
import { schemaId } from "../ids.js";
import type { Schema, SchemaField } from "../types.js";
import { recordId, schemaContent, serializeSchema, type SchemaRow } from "./serialize.js";

export async function listSchemas(): Promise<Schema[]> {
  const db = getDb();
  const [rows] = await db.query<[SchemaRow[]]>("SELECT * FROM schemas ORDER BY name ASC").collect();
  return rows.map(serializeSchema);
}

export interface SchemaInput {
  name: string;
  label: string | null;
  fields: SchemaField[];
}

/**
 * An item has one name, so at most one field can be it. Enforced here
 * rather than trusted of callers: the type manager keeps its toggles
 * behaving like a radio group, but a second window editing the same type
 * could still submit two, and "which one wins" should not depend on
 * which write landed last.
 */
function withOneNameField(fields: SchemaField[]): SchemaField[] {
  const first = fields.findIndex((field) => field.is_name);
  if (first === -1) return fields;
  return fields.map((field, at) => ({ ...field, is_name: at === first }));
}

/**
 * Create or edit a type. `name` is immutable once minted — it is the id
 * (`schemaId`), the same way a label's word is its id — so editing
 * always targets the same row a type started as, and there is no rename
 * path here (PRODUCT-SPEC has no precedent for one on labels either).
 */
export async function upsertSchema(input: SchemaInput): Promise<Schema> {
  const db = getDb();
  const [rows] = await db
    .query<[SchemaRow[]]>("UPSERT $id CONTENT $content RETURN AFTER", {
      id: recordId(schemaId(input.name)),
      content: schemaContent({ ...input, fields: withOneNameField(input.fields) }),
    })
    .collect();
  const row = rows[0];
  if (!row) throw new Error(`could not save type "${input.name}"`);
  return serializeSchema(row);
}
