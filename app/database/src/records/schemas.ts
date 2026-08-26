// Authored by Karter Whitman using Claude Sonnet 5
// Schemas: a type's field list, as data (types.ts). Created and edited
// from the schema manager, never through the Change model — like labels,
// there is nothing about one to undo, only the current shape of a type.
import { getDb } from "../db.js";
import { schemaId } from "../ids.js";
import { ensureTypeSpace } from "../sets/type-spaces.js";
import type { Schema, SchemaAttribute } from "../types.js";
import { recordId, schemaContent, serializeSchema, type SchemaRow } from "./serialize.js";

/**
 * Sorted here rather than by the query, because `ORDER BY name ASC` sorts
 * by codepoint: a schema created as `Song` came back before one created as
 * `album`, so the list arrived in one order and jumped to another the
 * moment the renderer re-sorted it after a save. `localeCompare` is what
 * that merge uses (views/schemas/SchemaManager.tsx), and the two have to
 * be the same comparator or they disagree exactly once, confusingly.
 */
export async function listSchemas(): Promise<Schema[]> {
  const db = getDb();
  const [rows] = await db.query<[SchemaRow[]]>("SELECT * FROM schemas").collect();
  return rows.map(serializeSchema).sort((a, b) => a.name.localeCompare(b.name));
}

export interface SchemaInput {
  name: string;
  attributes: SchemaAttribute[];
}

/**
 * Create or edit a type. `name` is immutable once minted — it is the id
 * (`schemaId`), the same way a label's word is its id — so editing
 * always targets the same row a type started as, and there is no rename
 * path here (PRODUCT-SPEC has no precedent for one on labels either).
 *
 * Minting a type this way never existed before also mints its dedicated
 * Space (`ensureTypeSpace` — sets/type-spaces.ts): a saved "type is X"
 * query is meant to exist the moment the type does, not only once
 * someone thinks to build one by hand. Editing an existing type's
 * attributes takes the same path and is deliberately exempt — the type
 * already has whatever Space it's going to have.
 */
export async function upsertSchema(input: SchemaInput): Promise<Schema> {
  const db = getDb();
  const id = recordId(schemaId(input.name));

  const [existing] = await db.query<[{ id: unknown }[]]>("SELECT VALUE id FROM $id", { id }).collect();
  const isNewType = existing.length === 0;

  const [rows] = await db
    .query<[SchemaRow[]]>("UPSERT $id CONTENT $content RETURN AFTER", { id, content: schemaContent(input) })
    .collect();
  const row = rows[0];
  if (!row) throw new Error(`could not save type "${input.name}"`);
  const saved = serializeSchema(row);

  if (isNewType) await ensureTypeSpace(saved.name);

  return saved;
}
