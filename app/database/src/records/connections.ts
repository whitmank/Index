// Authored by Karter Whitman using Claude Opus 4.8
// Connection reads, plus the lookup that keeps the arrow upsert rule
// (PRODUCT-SPEC §1.2) honest: at most one live connection per
// (source, target, label). Change constructors call `findConnection`
// first and either update the record they find or create a new one, so
// `changes.apply` can stay a blind writer.
import { getDb } from "../db.js";
import { MEMBER_OF_LABEL_ID, type Connection } from "../types.js";
import { idToString, recordId, serializeConnection, type ConnectionRow } from "./serialize.js";

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

/** Every live connection strictly between two of these ids — what a
 * canvas draws as an edge (the frontend's `connectionsAmong` applies the
 * identical rule to whatever this has already put in the pool). Distinct
 * from an arrow into a set: this is the relations members hold *between
 * each other*. */
export async function listConnectionsAmong(ids: string[]): Promise<Connection[]> {
  if (ids.length === 0) return [];
  const db = getDb();
  const [rows] = await db
    .query<[ConnectionRow[]]>(
      `SELECT * FROM connections WHERE in IN $ids AND out IN $ids AND in != out AND ${LIVE}`,
      { ids: ids.map(recordId) },
    )
    .collect();
  return rows.map(serializeConnection);
}

/** The live arrows into a set, carrying the position and order opinions
 * — sets/membership.ts's `listMembers` reads these for its arrow-side of
 * the union. `createdOn` narrows to arrows made on one day, for a set
 * that partitions its timeline by inclusion date (`public`). */
export async function listArrowsInto(
  setId: string,
  options: { createdOn?: string } = {},
): Promise<Connection[]> {
  const db = getDb();
  const clauses = ["out = $set", `label = ${MEMBER_OF_LABEL_ID}`, LIVE];
  const bindings: Record<string, unknown> = { set: recordId(setId) };

  if (options.createdOn !== undefined) {
    clauses.push("string::slice(<string> created_at, 0, 10) = $createdOn");
    bindings.createdOn = options.createdOn;
  }

  const [rows] = await db
    .query<[ConnectionRow[]]>(
      `SELECT * FROM connections WHERE ${clauses.join(" AND ")} ORDER BY created_at ASC`,
      bindings,
    )
    .collect();
  return rows.map(serializeConnection);
}

/** Every id that is the target of at least one live `member of` arrow —
 * the arrow half of "does this item play the set role"
 * (sets/membership.ts's `listSets`/`listPlacesAmong`), asked in bulk
 * rather than once per candidate item. */
export async function listMemberOfTargets(): Promise<string[]> {
  const db = getDb();
  const [rows] = await db
    .query<[unknown[]]>(`SELECT VALUE out FROM connections WHERE label = ${MEMBER_OF_LABEL_ID} AND ${LIVE}`)
    .collect();
  return rows.map(idToString);
}

/** Source ids with a live `member of` arrow into `targetId` — what an
 * `{ arrowTo }` predicate (query/context.ts) needs. Distinct from
 * `listArrowsInto`, which returns full Connection records for
 * position/order display; this returns just the ids a boolean
 * membership check needs. */
export async function listArrowSourcesInto(targetId: string): Promise<string[]> {
  const db = getDb();
  const [rows] = await db
    .query<[unknown[]]>(
      `SELECT VALUE in FROM connections WHERE out = $target AND label = ${MEMBER_OF_LABEL_ID} AND ${LIVE}`,
      { target: recordId(targetId) },
    )
    .collect();
  return rows.map(idToString);
}
