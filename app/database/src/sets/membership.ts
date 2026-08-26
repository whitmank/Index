// Authored by Karter Whitman using Claude Sonnet 5
// Space membership (DESIGN-CONCEPT §3): which items play the set role,
// and which items belong to one — query ∪ arrows, the union rule.
// Everything here reads; nothing writes (that's changes.ts, elsewhere).
// Built on the plain item/connection reads in `../records/` and the
// shared evaluator in `../query/` — this file is where those become
// Space-specific concepts (roles, membership, timeline partitioning).
import { buildContext, matches } from "../query/index.js";
import { listArrowsInto, listConnectionsAmong, listMemberOfTargets } from "../records/connections.js";
import { getItem, listItems, listLiveItems } from "../records/items.js";
import {
  HOME_SET_ID,
  isSystemId,
  PUBLIC_SET_ID,
  SPACES_SET_ID,
  type Item,
  type Members,
  type MembersOptions,
  type SetQuery,
} from "../types.js";

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

/**
 * The items that play the set role — what the home screen lists. An item
 * is a set when `set` carries a filter or the bootstrap `true` state, or
 * it has at least one live belonging arrow pointing at it. The two seeds
 * always qualify: `~` carries a filter, `public` carries the bootstrap
 * state. Roles are computed, never stored (DESIGN-CONCEPT §3) — `set`'s
 * `true` state is the one deliberate exception, for the bootstrapping
 * moment before a brand-new set has a filter or a member yet.
 */
export async function listSets(): Promise<Item[]> {
  const [items, arrowTargetList] = await Promise.all([listLiveItems(), listMemberOfTargets()]);
  const arrowTargets = new Set(arrowTargetList);

  return items
    .filter((item) => item.set !== false || arrowTargets.has(item.id))
    .sort((a, b) => {
      const aSystem = isSystemId(a.id);
      const bSystem = isSystemId(b.id);
      if (aSystem !== bSystem) return aSystem ? -1 : 1;
      return a.date_added.localeCompare(b.date_added);
    });
}

/** Which of these ids play the set role — what the shell may enter. */
export async function listPlacesAmong(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const [items, arrowTargetList] = await Promise.all([listItems(ids), listMemberOfTargets()]);
  const arrowTargets = new Set(arrowTargetList);
  return items.filter((item) => item.set !== false || arrowTargets.has(item.id)).map((item) => item.id);
}

/** `item.set` when it's a real filter, not just the bootstrap `true`
 * state or `false` — the one shape `matches`/`buildContext` know how to
 * read. */
function queryOf(item: Item): SetQuery | null {
  return typeof item.set === "object" ? item.set : null;
}

/** `date_created` isn't a same-named top-level property any more — it
 * lives in `data`, plain-string-valued, unlike `date_added`. */
function dateValueOf(item: Item, field: "date_added" | "date_created"): string | undefined {
  return field === "date_created" ? (item.data.date_created?.value as string | undefined) : item.date_added;
}

/** Every live item matching `query`, optionally narrowed to one
 * timeline page by composing an extra predicate onto it — the same
 * evaluator either way, so a set's own rule and its page-partitioning
 * are one matching pass, not two. */
async function listByQuery(
  query: SetQuery,
  partitionDate: string | undefined,
  dateField: "date_added" | "date_created",
): Promise<Item[]> {
  const composed: SetQuery =
    partitionDate === undefined
      ? query
      : {
          and: [
            query,
            dateField === "date_created"
              ? { data: { attribute: "date_created", kind: "date", gte: partitionDate, lte: partitionDate } }
              : { date: { gte: partitionDate, lte: partitionDate } },
          ],
        };

  const [items, ctx] = await Promise.all([listLiveItems(), buildContext(composed)]);
  return items.filter((item) => !isSystemId(item.id) && matches(composed, item, ctx));
}

/**
 * Members of a set = items matching its query ∪ items with a live arrow
 * into it (DESIGN-CONCEPT §3, the union rule). Query-matched membership
 * skips system items, so `~` — whose query is `{ all: true }` — does not
 * list itself, `public`, and `spaces` alongside the user's things; an
 * explicit arrow still admits them.
 */
export async function listMembers(setId: string, options: MembersOptions = {}): Promise<Members> {
  const set = await getItem(setId);
  if (!set) return { items: [], arrows: [], connections: [], places: [], pinnedIds: [] };

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
  // Tracked so a member admitted by both an arrow and the rule doesn't
  // read as merely pinned — only members the rule wouldn't have picked
  // on its own owe their place here to the arrow.
  const queryMatchedIds = new Set<string>();
  if (query) {
    for (const item of await listByQuery(
      query,
      partitionBy === "created_at" ? undefined : partition,
      itemDateField,
    )) {
      byId.set(item.id, item);
      queryMatchedIds.add(item.id);
    }
  }

  // An item admitted by an arrow still belongs to the page its own date
  // puts it on, when the set partitions by an item-level date —
  // `listByQuery` already applied this for query-matched items above, so
  // this only needs to catch the arrow-admitted ones.
  let items = [...byId.values()];
  // `~` and `spaces` are complements over the same "everything" query:
  // `~` reads as "everything you've added," not "everything, including
  // the Spaces you've built to organize it," and `spaces` is the mirror
  // image — only those Spaces, none of the plain items. A Space's own
  // arrows can still admit it elsewhere; not into either of these two.
  if (setId === HOME_SET_ID) {
    items = items.filter((item) => item.set === false);
  } else if (setId === SPACES_SET_ID) {
    items = items.filter((item) => item.set !== false);
  }
  if (partition && partitionBy !== "created_at") {
    items = items.filter((item) => dateValueOf(item, itemDateField)?.slice(0, 10) === partition);
  }

  items.sort((a, b) => a.date_added.localeCompare(b.date_added));
  const ids = items.map((item) => item.id);
  const [places, connections] = await Promise.all([listPlacesAmong(ids), listConnectionsAmong(ids)]);

  // Only meaningful once there is a rule to fall short of — a rule-less
  // set is a plain manual folder, where every member is "pinned" and
  // flagging all of them would say nothing.
  const arrowSourceIds = new Set(arrows.map((arrow) => arrow.source));
  const pinnedIds = query ? ids.filter((id) => arrowSourceIds.has(id) && !queryMatchedIds.has(id)) : [];

  return { items, arrows, connections, places, pinnedIds };
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
