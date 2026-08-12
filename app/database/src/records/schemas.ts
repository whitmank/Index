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
      content: schemaContent(input),
    })
    .collect();
  const row = rows[0];
  if (!row) throw new Error(`could not save type "${input.name}"`);
  return serializeSchema(row);
}
