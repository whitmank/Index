// Authored by Karter Whitman using Claude Opus 4.8
// The change catalog (PRODUCT-SPEC §3.3): one constructor per user
// intention, each returning a complete change. This is the only place in
// the renderer that decides what a gesture *means*; a handler wires an
// intent to one of these and then minds only its own UI concerns.
//
// Two rules run through all of them. Arrows are upserted, never
// duplicated — a constructor asks the pool for the live arrow first and
// updates it if there is one (PRODUCT-SPEC §1.2). And deletion is always
// soft: `after` carries `deleted_at`, so undo is symmetric and the GC,
// not the user, does the forgetting.
import type {
  Change,
  Connection,
  Field,
  Item,
  Position,
  Resource,
} from "@index/database/types";
import { today } from "../lib/dates.js";
import { isBlankFieldValue } from "../lib/fields.js";
import { connectionId, itemId } from "../lib/ids.js";
import { MEMBER_OF_LABEL_ID, PUBLIC_SET_ID } from "../lib/seeds.js";
import * as pool from "../store/pool.js";

function now(): string {
  return new Date().toISOString();
}

/** What an item's name is called when it has none yet. */
function nameOf(item: Item): string {
  return item.display_name ?? item.name ?? "";
}

function describe(item: Item): string {
  const name = nameOf(item);
  return name ? `'${name}'` : "the item";
}

function swap(before: Item, after: Item, description: string): Change {
  return { description, pairs: [{ before, after }] };
}

// ── items ───────────────────────────────────────────────────────────────

export function blankItem(date = today()): Item {
  return {
    id: itemId(),
    name: "",
    display_name: null,
    date,
    created_at: now(),
    opens: null,
    query: null,
    system: false,
    is_set: false,
    type: null,
    type_source: null,
    fields: [],
    resources: [],
    deleted_at: null,
  };
}

/** A new, empty item on a given day. The caller keeps the record: it
 * needs the id to open the item's focus view. */
export function createItem(item: Item): Change {
  return { description: "Create item", pairs: [{ before: null, after: item }] };
}

/**
 * A new set. It plays the set role from birth because `is_set` says so
 * — what listSets recognises — so an empty set still shows on the home
 * screen before it has a query or any members. How it's viewed (canvas
 * or list) is the application's global toggle, not anything stored here.
 * The caller keeps the record: it needs the id to navigate into the set.
 */
export function blankSet(name: string): Item {
  return { ...blankItem(), name, is_set: true };
}

export function createSet(set: Item): Change {
  return {
    description: set.name ? `Create set '${set.name}'` : "Create set",
    pairs: [{ before: null, after: set }],
  };
}

export function rename(item: Item, name: string): Change {
  return swap(item, { ...item, name }, name ? `Rename to '${name}'` : "Clear the name");
}

export function setDisplayName(item: Item, displayName: string): Change {
  const next = displayName.trim() || null;
  return swap(
    item,
    { ...item, display_name: next },
    next ? `Show as '${next}'` : "Clear the display name",
  );
}

export function setDate(item: Item, date: string): Change {
  return swap(item, { ...item, date }, `Move ${describe(item)} to ${date}`);
}

/** The presentation override — written only when the inference is wrong
 * (DESIGN-CONCEPT §5). Passing null retires it and lets the cascade
 * decide again. */
export function setOpens(item: Item, opens: string | null): Change {
  return swap(
    item,
    { ...item, opens },
    opens ? `Open ${describe(item)} as ${opens}` : `Let ${describe(item)} choose how it opens`,
  );
}

/** The classification — written by the classifier's guess, or by the
 * user correcting it. Passing null clears it, same as `setOpens`. */
/**
 * Only the type picker reaches this, so every call is a decision the user
 * made — which is what `type_source` records, and what stops the
 * classifier ever arguing with it (lib/resources.ts).
 *
 * Clearing returns the source to null rather than pinning "user" on an
 * empty type: clearing withdraws an opinion instead of asserting one, so
 * a later primary resource is free to be guessed from again.
 */
export function setType(item: Item, type: string | null): Change {
  return swap(
    item,
    { ...item, type, type_source: type ? "user" : null },
    type ? `Classify ${describe(item)} as ${type}` : `Clear the type on ${describe(item)}`,
  );
}

/**
 * Accept the classifier's guess as your own, or hand it back.
 *
 * Confirming changes nothing about *what* the type is — only who stands
 * behind it, which is what decides whether a later primary resource is
 * allowed to overrule it (lib/resources.ts). Handing it back is the only
 * route from "user" to "auto" that keeps the type: clearing would reopen
 * guessing too, but by throwing the answer away first.
 *
 * An item with no type has no provenance to record, so the invariant
 * (a type and its source are present or absent together) is enforced
 * here rather than assumed of every caller.
 */
export function setTypeConfirmed(item: Item, confirmed: boolean): Change {
  const source = item.type ? (confirmed ? "user" : "auto") : null;
  return swap(
    item,
    { ...item, type_source: source },
    confirmed
      ? `Confirm ${describe(item)} is a ${item.type}`
      : `Let ${describe(item)}'s type follow its primary resource again`,
  );
}

/** Blank rows vanish on commit — an empty name and value is a row the
 * user abandoned, not a fact. */
export function setFields(item: Item, fields: Field[]): Change {
  const kept = fields.filter((field) => field.name.trim() !== "" || !isBlankFieldValue(field.value));
  return swap(item, { ...item, fields: kept }, `Edit fields on ${describe(item)}`);
}

export function addResource(item: Item, resource: Resource): Change {
  return swap(
    item,
    { ...item, resources: [...item.resources, resource] },
    `Add '${resource.name}' to ${describe(item)}`,
  );
}

export function removeResource(item: Item, index: number): Change {
  const removed = item.resources[index];
  return swap(
    item,
    { ...item, resources: item.resources.filter((_, at) => at !== index) },
    removed ? `Remove '${removed.name}' from ${describe(item)}` : "Remove a resource",
  );
}

/** Resources are ordered and `resources[0]` is primary, so reordering is
 * how the user chooses what the item *is*. */
export function reorderResources(item: Item, from: number, to: number): Change {
  const resources = [...item.resources];
  const [moved] = resources.splice(from, 1);
  if (moved) resources.splice(to, 0, moved);
  return swap(item, { ...item, resources }, `Reorder resources on ${describe(item)}`);
}

/**
 * Deleting an item soft-deletes its live connections in the same change,
 * as explicit pairs, so undo restores them symmetrically. System items
 * refuse deletion.
 */
export function deleteItem(item: Item): Change | null {
  if (item.system) return null;

  const at = now();
  const touching = pool.connectionsTouching(item.id);

  return {
    description: `Delete ${describe(item)}`,
    pairs: [
      { before: item, after: { ...item, deleted_at: at } },
      ...touching.map((connection) => ({
        before: connection,
        after: { ...connection, deleted_at: at },
      })),
    ],
  };
}

// ── arrows and connections ──────────────────────────────────────────────

function blankConnection(
  source: string,
  target: string,
  label: string | null = null,
): Connection {
  return {
    id: connectionId(),
    source,
    target,
    label,
    position: null,
    order: null,
    child: false,
    created_at: now(),
    deleted_at: null,
  };
}

/**
 * Tag an item into a set — the one gesture that mints a `member of`
 * arrow, the reserved structural label (types.ts). When the target is a
 * word the user just typed, the item behind it is minted in the same
 * change — two pairs, one intention, one undo.
 */
export function tag(item: Item, target: Item, targetIsNew = false): Change {
  const existing = pool.findConnection(item.id, target.id, MEMBER_OF_LABEL_ID);
  const arrow = existing ?? blankConnection(item.id, target.id, MEMBER_OF_LABEL_ID);

  return {
    description: `Tag ${describe(item)} as '${nameOf(target)}'`,
    pairs: [
      ...(targetIsNew ? [{ before: null, after: target }] : []),
      { before: existing ?? null, after: arrow },
    ],
  };
}

/**
 * A plain connection: two items pointed at each other with nothing said
 * about why — canvas free-draw's whole vocabulary (Canvas.tsx's edge
 * gesture). Unlabelled, and therefore never structural: drawing this
 * never turns its target into a place. Upserts over an existing plain
 * connection between the same pair rather than duplicating.
 */
export function relate(item: Item, target: Item): Change {
  const existing = pool.findConnection(item.id, target.id, null);
  const connection = existing ?? blankConnection(item.id, target.id);

  return {
    description: `Connect ${describe(item)} and '${nameOf(target)}'`,
    pairs: [{ before: existing ?? null, after: connection }],
  };
}

/**
 * Tag many items into one set at once — the batch bar's "add to set".
 * One change, not N: the user made one decision, so one undo has to take
 * it back. Items already in the set contribute no pair, so re-adding is
 * silent rather than a no-op change cluttering the history; if that
 * empties the change entirely, the caller has nothing to apply.
 */
export function tagMany(items: Item[], target: Item, targetIsNew = false): Change {
  const pairs = items.flatMap((item) => {
    if (item.id === target.id) return []; // a set cannot be its own member
    if (pool.findConnection(item.id, target.id, MEMBER_OF_LABEL_ID)) return [];
    return [{ before: null, after: blankConnection(item.id, target.id, MEMBER_OF_LABEL_ID) }];
  });

  return {
    description: `Add ${countOf(pairs.length, "item")} to '${nameOf(target)}'`,
    pairs: targetIsNew && pairs.length > 0 ? [{ before: null, after: target }, ...pairs] : pairs,
  };
}

/**
 * Take many items out of one set at once. Only an arrow can be withdrawn
 * — an item the set's query matches is there by description, not by
 * anyone's opinion — so items without one contribute no pair, and a
 * change with no pairs is the caller's signal that nothing could be done.
 */
export function untagMany(items: Item[], target: Item): Change {
  const pairs = items.flatMap((item) => {
    const arrow = pool.findConnection(item.id, target.id, MEMBER_OF_LABEL_ID);
    return arrow ? [{ before: arrow, after: { ...arrow, deleted_at: now() } }] : [];
  });

  return {
    description: `Remove ${countOf(pairs.length, "item")} from '${nameOf(target)}'`,
    pairs,
  };
}

/**
 * Delete many items and everything touching them, in one change. System
 * items refuse deletion here exactly as they do one at a time — the batch
 * simply passes over them rather than failing whole.
 */
export function deleteMany(items: Item[]): Change {
  const at = now();
  const deletable = items.filter((item) => !item.system);
  const connections = new Map<string, Connection>();
  for (const item of deletable) {
    for (const connection of pool.connectionsTouching(item.id)) {
      // A connection between two doomed items is touched by both; the map
      // keeps one pair for it, because two would undo each other.
      connections.set(connection.id, connection);
    }
  }

  return {
    description: `Delete ${countOf(deletable.length, "item")}`,
    pairs: [
      ...deletable.map((item) => ({ before: item, after: { ...item, deleted_at: at } })),
      ...[...connections.values()].map((connection) => ({
        before: connection,
        after: { ...connection, deleted_at: at },
      })),
    ],
  };
}

function countOf(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

export function untag(item: Item, target: Item): Change | null {
  const arrow = pool.findConnection(item.id, target.id, MEMBER_OF_LABEL_ID);
  if (!arrow) return null;

  return {
    description: `Remove ${describe(item)} from '${nameOf(target)}'`,
    pairs: [{ before: arrow, after: { ...arrow, deleted_at: now() } }],
  };
}

/** A labelled statement: `novel —author→ hemingway`. The label record is
 * minted by the backend on first use, outside the change model.
 * `options.child` marks `target` as a child of `item` (hierarchy,
 * orthogonal to the label); `options.order` sets its manual place among
 * that parent's children — both applied over the existing/blank
 * connection, so re-connecting the same pair upserts rather than
 * duplicating. */
export function connect(
  item: Item,
  labelId: string,
  labelName: string,
  target: Item,
  options: { child?: boolean; order?: number } = {},
): Change {
  const existing = pool.findConnection(item.id, target.id, labelId);
  const connection = { ...(existing ?? blankConnection(item.id, target.id, labelId)) };
  if (options.child !== undefined) connection.child = options.child;
  if (options.order !== undefined) connection.order = options.order;

  return {
    description: `${describe(item)} —${labelName}→ '${nameOf(target)}'`,
    pairs: [{ before: existing ?? null, after: connection }],
  };
}

export function disconnect(connection: Connection): Change {
  return {
    description: "Remove connection",
    pairs: [{ before: connection, after: { ...connection, deleted_at: now() } }],
  };
}

/**
 * Where the user put an item in a canvas of a set. The position rides on
 * the arrow to that set, so a query-admitted item materialises one the
 * moment there is an opinion to record — additively, as DESIGN-CONCEPT §3
 * describes.
 */
export function place(item: Item, setId: string, position: Position): Change {
  const existing = pool.findConnection(item.id, setId, MEMBER_OF_LABEL_ID);
  const arrow = existing ?? blankConnection(item.id, setId, MEMBER_OF_LABEL_ID);

  return {
    description: `Place ${describe(item)}`,
    pairs: [{ before: existing ?? null, after: { ...arrow, position } }],
  };
}

/**
 * Manual ordering in a list of a set. Moving one row renumbers the rows
 * it displaced, inside the same change — so one undo puts the whole list
 * back. Only arrows whose order actually changes get a pair.
 */
export function reorder(item: Item, setId: string, index: number): Change {
  const arrows = pool.arrowsInto(setId);
  const existing = pool.findConnection(item.id, setId, MEMBER_OF_LABEL_ID);
  const arrow = existing ?? blankConnection(item.id, setId, MEMBER_OF_LABEL_ID);

  const without = arrows.filter((candidate) => candidate.id !== arrow.id);
  const ordered = [...without.slice(0, index), arrow, ...without.slice(index)];

  const pairs = ordered.flatMap((candidate, position) => {
    const isTheMovedOne = candidate.id === arrow.id;
    const before = isTheMovedOne ? (existing ?? null) : candidate;

    if (!isTheMovedOne && candidate.order === position) return [];
    return [{ before, after: { ...candidate, order: position } }];
  });

  return { description: `Reorder ${describe(item)}`, pairs };
}

/** Clearing every manual order returns the list to its intrinsic sort —
 * the ✕ on the "sorted manually" chip, one change. */
export function clearOrder(setId: string): Change {
  const pairs = pool
    .arrowsInto(setId)
    .filter((arrow) => arrow.order !== null)
    .map((arrow) => ({ before: arrow, after: { ...arrow, order: null } }));

  return { description: "Sort by date again", pairs };
}

/**
 * Publicness is membership in the `public` set (DESIGN-CONCEPT §9), but
 * the gesture is a switch, not a tag — which is exactly why it gets its
 * own constructor rather than reusing `tag`.
 */
export function setPublic(item: Item, isPublic: boolean): Change | null {
  const existing = pool.findConnection(item.id, PUBLIC_SET_ID, MEMBER_OF_LABEL_ID);

  if (isPublic) {
    if (existing) return null; // already public; nothing to say
    return {
      description: `Make ${describe(item)} public`,
      pairs: [{ before: null, after: blankConnection(item.id, PUBLIC_SET_ID, MEMBER_OF_LABEL_ID) }],
    };
  }

  if (!existing) return null;
  return {
    description: `Make ${describe(item)} private`,
    pairs: [{ before: existing, after: { ...existing, deleted_at: now() } }],
  };
}
