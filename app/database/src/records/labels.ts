// Authored by Karter Whitman using Claude Opus 4.8
// Labels: the words on labelled arrows. Created on first use, never
// deleted automatically, and never an endpoint — which is why this is the
// whole file.
import { getDb } from "../db.js";
import { labelId } from "../ids.js";
import type { Label } from "../types.js";
import { recordId, serializeLabel, type LabelRow } from "./serialize.js";

export async function listLabels(): Promise<Label[]> {
  const db = getDb();
  const [rows] = await db.query<[LabelRow[]]>("SELECT * FROM labels ORDER BY name ASC").collect();
  return rows.map(serializeLabel);
}

/**
 * The label for this word, minting it if this is its first use. Labels
 * sit outside the change model: they carry no user-visible state of their
 * own, so there is nothing about one to undo.
 */
export async function ensureLabel(name: string): Promise<Label> {
  const db = getDb();
  const trimmed = name.trim();
  const [rows] = await db
    .query<[LabelRow[]]>("UPSERT $id CONTENT { name: $name } RETURN AFTER", {
      id: recordId(labelId(trimmed)),
      name: trimmed,
    })
    .collect();
  const row = rows[0];
  if (!row) throw new Error(`could not create label "${trimmed}"`);
  return serializeLabel(row);
}
