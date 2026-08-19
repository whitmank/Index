// Authored by Karter Whitman using Claude Opus 4.8
// Item reads. Every read here filters soft-deleted rows; the one path
// that doesn't is `getItemIncludingDeleted`, which the GC uses and which
// says so in its name.
import { getDb } from "../db.js";
import { formatOf } from "../derive.js";
import {
  HOME_SET_ID,
  MEMBER_OF_LABEL_ID,
  PUBLIC_SET_ID,
  type ConnectionWithEndpoint,
  type EndpointSummary,
  type Item,
  type ItemDetail,
  type Members,
  type MembersOptions,
  type SetQuery,
} from "../types.js";
import { listConnectionsAmong } from "./connections.js";
import { compileQuery } from "./query.js";
import {
  idToString,
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

export type TimelinePartition = "date_added" | "date_created" | "created_at";

export function timelinePartitionOf(set: Item): TimelinePartition {
  const value = set.data[TIMELINE_PARTITION_FIELD]?.value;
  if (value === "created_at") return "created_at";
  if (value === "date_created") return "date_created";
  return "date_added";
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

/** Every live item with at least one resource — the population the
 * relink reconciler walks. A full scan is the same trade DESIGN-CONCEPT
 * §8 already licenses for `searchItems`: personal scale, not millions. */
export async function listItemsWithResources(): Promise<Item[]> {
  const db = getDb();
  const [rows] = await db
    .query<[ItemRow[]]>(`SELECT * FROM items WHERE ${LIVE} AND array::len(resources) > 0`)
    .collect();
  return rows.map(serializeItem);
}

/**
 * The items that play the set role — what the home screen lists. An item
 * is a set when `set` carries a filter or the bootstrap `true` state, or
 * it has at least one live belonging arrow pointing at it. The two seeds
 * always qualify: `~` carries a filter, `public` carries the bootstrap
 * state. Roles are computed, never stored (DESIGN-CONCEPT §3) — `set`'s
 * `true` state is the one deliberate exception, for the bootstrapping
 * moment before a brand-new set has a filter or a member yet.
 */
/**
 * The set role, as a SurrealQL predicate. Named once because two callers
 * ask the same question of different populations — `listSets` of every
 * item, `listPlacesAmong` of one set's members — and an item has to play
 * the role identically wherever it is asked about.
 *
 * `member of` is the one reserved, structural label — everything else
 * (unlabelled, or any other label like `track`/`author`/`related`) is a
 * plain relationship and never promotes its target. Unlike `set`, which
 * is always explicit, an unlabelled arrow used to mean "belongs"
 * implicitly; that's the rule this replaces (a freehand canvas edge no
 * longer turns whatever it lands on into a container).
 */
const PLAYS_SET_ROLE = `(
  set != false
  OR id IN (SELECT VALUE out FROM connections WHERE label = ${MEMBER_OF_LABEL_ID} AND ${LIVE})
)`;

export async function listSets(): Promise<Item[]> {
  const db = getDb();
  // ORDER BY only accepts a field/idiom, not an arbitrary expression —
  // verified directly against SurrealDB 3.0.4 — so the boolean is
  // projected as its own field first, then ordered by that.
  const [rows] = await db
    .query<[ItemRow[]]>(
      `SELECT *, (id = $home OR id = $public) AS is_system FROM items
       WHERE ${LIVE} AND ${PLAYS_SET_ROLE}
       ORDER BY is_system DESC, date_added ASC`,
      { home: recordId(HOME_SET_ID), public: recordId(PUBLIC_SET_ID) },
    )
    .collect();
  return rows.map(serializeItem);
}

/** Which of these ids play the set role — what the shell may enter. */
export async function listPlacesAmong(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const db = getDb();
  const [rows] = await db
    .query<[unknown[]]>(
      `SELECT VALUE id FROM items WHERE id IN $ids AND ${LIVE} AND ${PLAYS_SET_ROLE}`,
      { ids: ids.map(recordId) },
    )
    .collect();
  return rows.map(idToString);
}

/**
 * Name/display-name search — the command bar's and the tag composer's
 * lookup. Substring, not prefix: you rarely remember how a thing's name
 * *starts*, and a bar you must spell into from the left is a bar you stop
 * reaching for.
 *
 * The database narrows, then JS ranks: exact name over prefix over
 * substring, shorter names before longer ones at the same rank (the term
 * is a larger share of them), alphabetical last. Ranking has to happen
 * over the whole match population, so the LIMIT is applied after it — at
 * personal scale a scan over freeform names is free (DESIGN-CONCEPT §8),
 * and limiting first would cut good matches off alphabetically.
 */
export async function searchItems(term: string, limit = 20): Promise<Item[]> {
  const needle = term.trim().toLowerCase();
  if (!needle) return [];

  const db = getDb();
  const [rows] = await db
    .query<[ItemRow[]]>(
      `SELECT * FROM items
       WHERE ${LIVE}
         AND (string::contains(string::lowercase(data.name.value), $term)
           OR string::contains(string::lowercase(data.display_name.value ?? ""), $term))`,
      { term: needle },
    )
    .collect();

  return rows
    .map(serializeItem)
    .sort((a, b) => {
      const byRank = matchRank(a, needle) - matchRank(b, needle);
      if (byRank !== 0) return byRank;
      const byLength = captionOf(a).length - captionOf(b).length;
      if (byLength !== 0) return byLength;
      return captionOf(a).localeCompare(captionOf(b));
    })
    .slice(0, limit);
}

function nameOf(item: Item): string {
  return item.data.name.value as string;
}

function displayNameOf(item: Item): string | undefined {
  return item.data.display_name?.value as string | undefined;
}

/** What the caption reads as — the same choice the views draw. */
function captionOf(item: Item): string {
  return displayNameOf(item) ?? nameOf(item);
}

/** 0 exact, 1 prefix, 2 substring — the best of the two names. */
function matchRank(item: Item, needle: string): number {
  return Math.min(
    ...[nameOf(item), displayNameOf(item) ?? ""].map((name) => {
      const lowered = name.toLowerCase();
      if (lowered === needle) return 0;
      if (lowered.startsWith(needle)) return 1;
      return lowered.includes(needle) ? 2 : 3;
    }),
  );
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
  if (!set) return { items: [], arrows: [], connections: [], places: [] };

  const partition = options.partition?.date;
  const partitionBy = timelinePartitionOf(set);
  // The two item-level dates share the same partitioning machinery;
  // `created_at` is the one that instead partitions the arrow, below.
  const itemDateField = partitionBy === "date_created" ? "date_created" : "date_added";

  const arrows = await listArrowsInto(setId, {
    createdOn: partition && partitionBy === "created_at" ? partition : undefined,
  });

  const byId = new Map<string, Item>();
  for (const item of await listItems(arrows.map((arrow) => arrow.source))) {
    byId.set(item.id, item);
  }

  const query = queryOf(set);
  if (query) {
    for (const item of await listByQuery(
      query,
      partitionBy === "created_at" ? undefined : partition,
      itemDateField,
    )) {
      byId.set(item.id, item);
    }
  }

  let items = [...byId.values()];

  // An item admitted by an arrow still belongs to the page its own date
  // puts it on, when the set partitions by an item-level date.
  if (partition && partitionBy !== "created_at") {
    items = items.filter((item) => dateValueOf(item, itemDateField)?.slice(0, 10) === partition);
  }

  items.sort((a, b) => a.date_added.localeCompare(b.date_added));
  const ids = items.map((item) => item.id);
  const [places, connections] = await Promise.all([listPlacesAmong(ids), listConnectionsAmong(ids)]);
  return { items, arrows, connections, places };
}

/** `item.set` when it's a real filter, not just the bootstrap `true`
 * state or `false` — the one shape `compileQuery` knows how to read. */
function queryOf(item: Item): SetQuery | null {
  return typeof item.set === "object" ? item.set : null;
}

/** `date_created` isn't a same-named top-level property any more — it
 * lives in `data`, plain-string-valued, unlike `date_added`. */
function dateValueOf(item: Item, field: "date_added" | "date_created"): string | undefined {
  return field === "date_created" ? (item.data.date_created?.value as string | undefined) : item.date_added;
}

async function listByQuery(
  query: SetQuery,
  partitionDate: string | undefined,
  dateField: "date_added" | "date_created",
): Promise<Item[]> {
  const db = getDb();
  const compiled = compileQuery(query);

  const clauses = [LIVE, "id != $home", "id != $public", compiled.where];
  const bindings: Record<string, unknown> = {
    ...compiled.bindings,
    home: recordId(HOME_SET_ID),
    public: recordId(PUBLIC_SET_ID),
  };
  if (partitionDate !== undefined) {
    // `date_added` is a real `datetime` column and needs the cast;
    // `data.date_created.value` is already a plain string.
    const target = dateField === "date_created" ? "data.date_created.value" : "<string> date_added";
    clauses.push(`string::slice(${target}, 0, 10) = $partitionDate`);
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

/** The dates on which a set has members — the calendar popover's marks.
 * Read against whichever date the set itself pages by, so the marks
 * always agree with the days `listMembers` will actually turn up. */
export async function listMemberDates(setId: string): Promise<string[]> {
  const set = await getItem(setId);
  const { items } = await listMembers(setId);
  const partitionBy = set ? timelinePartitionOf(set) : "date_added";

  const dayOf = (item: Item): string | null =>
    dateValueOf(item, partitionBy === "date_created" ? "date_created" : "date_added")?.slice(0, 10) ?? null;

  const dates = items.map(dayOf).filter((date): date is string => date !== null);
  return [...new Set(dates)].sort();
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
