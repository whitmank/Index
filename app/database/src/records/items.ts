// Authored by Karter Whitman using Claude Opus 4.8
// Plain item reads: single items, several by id, everything with
// resources, everything live. Every read here filters soft-deleted rows;
// the one path that doesn't is `getItemIncludingDeleted`, which the GC
// uses and which says so in its name. Space-specific reads (which items
// play the set role, a set's membership, timeline partitioning) live in
// `../sets/membership.js`; search lives in `../search/search.js` — both
// import the plain reads here rather than duplicating them.
import { getDb } from "../db.js";
import type { ConnectionWithEndpoint, EndpointSummary, Item, ItemDetail } from "../types.js";
import {
  recordId,
  serializeConnection,
  serializeItem,
  type ConnectionRow,
  type ItemRow,
} from "./serialize.js";

const LIVE = "deleted_at IS NONE";

export async function getItem(id: string): Promise<Item | null> {
  const db = getDb();
  const [rows] = await db
    .query<[ItemRow[]]>(`SELECT * FROM $id WHERE ${LIVE}`, { id: recordId(id) })
    .collect();
  const row = rows[0];
  return row ? serializeItem(row) : null;
}

export async function getItemIncludingDeleted(id: string): Promise<Item | null> {
  const db = getDb();
  const [rows] = await db.query<[ItemRow[]]>("SELECT * FROM $id", { id: recordId(id) }).collect();
  const row = rows[0];
  return row ? serializeItem(row) : null;
}

export async function listItems(ids: string[]): Promise<Item[]> {
  if (ids.length === 0) return [];
  const db = getDb();
  const [rows] = await db
    .query<[ItemRow[]]>(`SELECT * FROM items WHERE id IN $ids AND ${LIVE}`, {
      ids: ids.map(recordId),
    })
    .collect();
  return rows.map(serializeItem);
}

/** Every live item with at least one resource — the population the
 * relink reconciler walks. A full scan is the same trade DESIGN-CONCEPT
 * §8 already licenses for search: personal scale, not millions. */
export async function listItemsWithResources(): Promise<Item[]> {
  const db = getDb();
  const [rows] = await db
    .query<[ItemRow[]]>(`SELECT * FROM items WHERE ${LIVE} AND array::len(resources) > 0`)
    .collect();
  return rows.map(serializeItem);
}

/** Every live item, unfiltered otherwise — the candidate set `sets/` and
 * `search/` scan in JS (`query/evaluate.ts`'s `matches`). The one
 * remaining SQL query underneath both: soft-delete exclusion stays cheap
 * and in SQL, everything else moves to the JS evaluator. */
export async function listLiveItems(): Promise<Item[]> {
  const db = getDb();
  const [rows] = await db.query<[ItemRow[]]>(`SELECT * FROM items WHERE ${LIVE}`).collect();
  return rows.map(serializeItem);
}

/** Just the name — the one guaranteed key. Exported for `sets/` and
 * `search/`, which both need it for captions/ranking without duplicating
 * the cast. */
export function nameOf(item: Item): string {
  return item.data.name.value as string;
}

export function displayNameOf(item: Item): string | undefined {
  return item.data.display_name?.value as string | undefined;
}

/** One item with its connections, each resolved to the item at its far
 * end so the focus view can draw chips without a second round trip. */
export async function getItemDetail(id: string): Promise<ItemDetail | null> {
  const item = await getItem(id);
  if (!item) return null;

  const db = getDb();
  const [outboundRows, inboundRows] = await db
    .query<[ConnectionRow[], ConnectionRow[]]>(
      `SELECT * FROM connections WHERE in = $id AND ${LIVE} ORDER BY created_at ASC;
       SELECT * FROM connections WHERE out = $id AND ${LIVE} ORDER BY created_at ASC;`,
      { id: recordId(id) },
    )
    .collect();

  const outbound = outboundRows.map(serializeConnection);
  const inbound = inboundRows.map(serializeConnection);

  const endpointIds = [
    ...new Set([...outbound.map((c) => c.target), ...inbound.map((c) => c.source)]),
  ];
  const endpoints = new Map<string, EndpointSummary>();
  for (const endpoint of await listItems(endpointIds)) {
    endpoints.set(endpoint.id, {
      id: endpoint.id,
      name: nameOf(endpoint),
      display_name: displayNameOf(endpoint) ?? null,
    });
  }

  const resolve = (connections: typeof outbound, far: "source" | "target") =>
    connections.flatMap<ConnectionWithEndpoint>((connection) => {
      const endpoint = endpoints.get(connection[far]);
      // A connection whose far end was deleted is not shown; the GC will
      // collect it, and until then it has nothing to point at.
      return endpoint ? [{ connection, endpoint }] : [];
    });

  return { item, inbound: resolve(inbound, "source"), outbound: resolve(outbound, "target") };
}
