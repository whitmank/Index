// Authored by Karter Whitman using Claude Opus 4.8
// Connection reads, plus the lookup that keeps the arrow upsert rule
// (PRODUCT-SPEC §1.2) honest: at most one live connection per
// (source, target, label). Change constructors call `findConnection`
// first and either update the record they find or create a new one, so
// `changes.apply` can stay a blind writer.
import { getDb } from "../db.js";
import type { Connection } from "../types.js";
import { recordId, serializeConnection, type ConnectionRow } from "./serialize.js";

const LIVE = "deleted_at IS NONE";

export async function getConnection(id: string): Promise<Connection | null> {
  const db = getDb();
  const [rows] = await db
    .query<[ConnectionRow[]]>(`SELECT * FROM $id WHERE ${LIVE}`, { id: recordId(id) })
    .collect();
  const row = rows[0];
  return row ? serializeConnection(row) : null;
}

/** The live connection for this exact statement, if one already exists.
 * `label: null` looks for the unlabelled arrow. */
export async function findConnection(
  source: string,
  target: string,
  label: string | null = null,
): Promise<Connection | null> {
  const db = getDb();
  const labelClause = label === null ? "label IS NONE" : "label = $label";
  const bindings: Record<string, unknown> = {
    source: recordId(source),
    target: recordId(target),
  };
  if (label !== null) bindings.label = recordId(label);

  const [rows] = await db
    .query<[ConnectionRow[]]>(
      `SELECT * FROM connections
       WHERE in = $source AND out = $target AND ${labelClause} AND ${LIVE}
       LIMIT 1`,
      bindings,
    )
    .collect();
  const row = rows[0];
  return row ? serializeConnection(row) : null;
}

/** Every live connection touching an item, in either direction — what a
 * delete change has to soft-delete alongside the item itself. */
export async function listConnectionsTouching(itemId: string): Promise<Connection[]> {
  const db = getDb();
  const [rows] = await db
    .query<[ConnectionRow[]]>(
      `SELECT * FROM connections WHERE (in = $id OR out = $id) AND ${LIVE}`,
      { id: recordId(itemId) },
    )
    .collect();
  return rows.map(serializeConnection);
}
