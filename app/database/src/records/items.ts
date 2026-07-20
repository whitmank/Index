// Authored by Karter Whitman using Claude Opus 4.8
// Item reads. Every read here filters soft-deleted rows; the one path
// that doesn't is `getItemIncludingDeleted`, which the GC uses and which
// says so in its name.
import { getDb } from "../db.js";
import { formatOf } from "../derive.js";
import type {
  ConnectionWithEndpoint,
  EndpointSummary,
  Item,
  ItemDetail,
  Members,
  MembersOptions,
} from "../types.js";
import { compileQuery } from "./query.js";
import {
  recordId,
  serializeConnection,
  serializeItem,
  type ConnectionRow,
  type ItemRow,
} from "./serialize.js";

const LIVE = "deleted_at IS NONE";

/** The set fields that parameterise its timeline view (PRODUCT-SPEC §1.4). */
export const TIMELINE_PARTITION_FIELD = "timeline_partition";
export const TIMELINE_DIRECTION_FIELD = "timeline_direction";

export type TimelinePartition = "date" | "created_at";

export function timelinePartitionOf(set: Item): TimelinePartition {
  const field = set.fields.find((entry) => entry.name === TIMELINE_PARTITION_FIELD);
  return field?.value === "created_at" ? "created_at" : "date";
}

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

/** Name/display-name prefix search — the tag composer's and the set
 * switcher's lookup. */
export async function searchItems(prefix: string, limit = 20): Promise<Item[]> {
  const db = getDb();
  const [rows] = await db
    .query<[ItemRow[]]>(
      `SELECT * FROM items
       WHERE ${LIVE}
         AND (string::starts_with(string::lowercase(name), $prefix)
           OR string::starts_with(string::lowercase(display_name ?? ""), $prefix))
       ORDER BY name ASC LIMIT $limit`,
      { prefix: prefix.trim().toLowerCase(), limit },
    )
    .collect();
  return rows.map(serializeItem);
}

/**
 * Members of a set = items matching its query ∪ items with a live arrow
 * into it (DESIGN-CONCEPT §3, the union rule). Query-matched membership
 * skips system items, so `~` — whose query is `{ all: true }` — does not
 * list itself and `public` alongside the user's things; an explicit arrow
 * still admits them.
 */
export async function listMembers(setId: string, options: MembersOptions = {}): Promise<Members> {
  const set = await getItem(setId);
  if (!set) return { items: [], arrows: [] };

  const partition = options.partition?.date;
  const partitionBy = timelinePartitionOf(set);

  const arrows = await listArrowsInto(setId, {
    createdOn: partition && partitionBy === "created_at" ? partition : undefined,
  });

  const byId = new Map<string, Item>();
  for (const item of await listItems(arrows.map((arrow) => arrow.source))) {
    byId.set(item.id, item);
  }

  if (set.query) {
    for (const item of await listByQuery(set, partitionBy === "date" ? partition : undefined)) {
      byId.set(item.id, item);
    }
  }

  let items = [...byId.values()];

  // An item admitted by an arrow still belongs to the page its own date
  // puts it on, when the set partitions by date.
  if (partition && partitionBy === "date") {
    items = items.filter((item) => item.date === partition);
  }

  items.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { items, arrows };
}

async function listByQuery(set: Item, partitionDate: string | undefined): Promise<Item[]> {
  if (!set.query) return [];
  const db = getDb();
  const compiled = compileQuery(set.query);

  const clauses = [LIVE, "system = false", compiled.where];
  const bindings: Record<string, unknown> = { ...compiled.bindings };
  if (partitionDate !== undefined) {
    clauses.push("date = $partitionDate");
    bindings.partitionDate = partitionDate;
  }

  const [rows] = await db
    .query<[ItemRow[]]>(`SELECT * FROM items WHERE ${clauses.join(" AND ")}`, bindings)
    .collect();

  const items = rows.map(serializeItem);
  if (compiled.formats.length === 0) return items;
  return items.filter((item) => compiled.formats.includes(formatOf(item)));
}

/** The live arrows into a set, carrying the position and order opinions. */
export async function listArrowsInto(
  setId: string,
  options: { createdOn?: string } = {},
): Promise<import("../types.js").Connection[]> {
  const db = getDb();
  const clauses = ["out = $set", "label IS NONE", LIVE];
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

/** The dates on which a set has members — the calendar popover's marks. */
export async function listMemberDates(setId: string): Promise<string[]> {
  const { items } = await listMembers(setId);
  return [...new Set(items.map((item) => item.date))].sort();
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
      name: endpoint.name,
      display_name: endpoint.display_name,
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
