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
  Data,
  DataEntry,
  Item,
  Position,
  Resource,
  SetQuery,
} from "@index/database/types";
import { isBlankFieldValue } from "../lib/data.js";
import { connectionId, itemId, ulid } from "../lib/ids.js";
import { isSystemId, MEMBER_OF_LABEL_ID, PUBLIC_SET_ID } from "../lib/seeds.js";
import * as pool from "../store/pool.js";

function now(): string {
  return new Date().toISOString();
}

function stringValue(entry: DataEntry | undefined): string | undefined {
  return entry ? (entry.value as string) : undefined;
}

/** What an item's name is called when it has none yet. */
function nameOf(item: Item): string {
  return stringValue(item.data.display_name) ?? stringValue(item.data.name) ?? "";
}

/** Upsert a named entry into `data`, without disturbing anything else. */
function withEntry(data: Data, attribute: string, value: DataEntry["value"], kind: DataEntry["kind"]): Data {
  return { ...data, [attribute.toLowerCase()]: { attribute, value, kind, prov: "user" } };
}

/** Clear a named entry — the key itself is removed, matching how a
 * scalar field used to go back to `null`. `name` can never be cleared
 * this way (its key is required); callers wanting to blank the name
 * write an empty string as its value instead. */
function withoutEntry(data: Data, attribute: string): Data {
  const key = attribute.toLowerCase();
  if (key === "name") return data;
  const { [key]: _removed, ...rest } = data;
  return rest as Data;
}

function describe(item: Item): string {
  const name = nameOf(item);
  return name ? `'${name}'` : "the item";
}

function swap(before: Item, after: Item, description: string): Change {
  return { description, pairs: [{ before, after }] };
}

// ── items ───────────────────────────────────────────────────────────────

/** `dateAdded` defaults to the exact moment of creation, not just today's
 * date — List.tsx sorts by `date_added` to break same-day ties, so two
 * items minted the same day without a real time-of-day would be
 * indistinguishable to it and could land in either order. A caller
 * backdating onto a specific day it's looking at (Calendar's day pages,
 * a song riding on its album's day) passes that day explicitly instead,
 * and keeps the coarser precision that implies. */
export function blankItem(dateAdded = now()): Item {
  return {
    id: itemId(),
    date_added: dateAdded,
    layout: "default",
    set: false,
    data: { name: { attribute: "name", value: "", kind: "string", prov: "user" } },
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
 * A new set. It plays the set role from birth because `set` carries the
 * bootstrap `true` state — what listSets recognises — so an empty set
 * still shows on the home screen before it has a filter or any members.
 * How it's viewed (canvas or list) is the application's global toggle,
 * not anything stored here. The caller keeps the record: it needs the
 * id to navigate into the set.
 */
export function blankSet(name: string): Item {
  const blank = blankItem();
  return { ...blank, data: withEntry(blank.data, "name", name, "string"), set: true };
}

export function createSet(set: Item): Change {
  const name = set.data.name.value as string;
  return {
    description: name ? `Create set '${name}'` : "Create set",
    pairs: [{ before: null, after: set }],
  };
}

/** A Space's rule, replaced whole. The rule builder calls this once per
 * settled edit — add/edit/remove a condition, restructure a group — same
 * commit-on-settle discipline as every other field (DESIGN-CONCEPT §6):
 * each edit is its own undoable Change, never one change for a whole
 * editing session. */
export function setQuery(item: Item, query: SetQuery): Change {
  return swap(item, { ...item, set: query }, `Edit ${describe(item)}'s rule`);
}

/** Names a record directly — the whole of naming for anything that is
 * never auto-modeled, a Space among them (RuleBuilder.tsx). An *item*
 * with resources is different: its `name` belongs to the modeler
 * (item-modeler's `apply-modeling-result.ts` writes it unconditionally,
 * every run), so a person retitling one uses `setDisplayName` below
 * instead — this stays the plain, unprotected writer underneath it. */
export function rename(item: Item, name: string): Change {
  return swap(
    item,
    { ...item, data: withEntry(item.data, "name", name, "string") },
    name ? `Rename to '${name}'` : "Clear the name",
  );
}

/**
 * How a person retitles an *item* (Focus.tsx's title field) — as
 * distinct from `rename`, which writes the modeler's own `name` field
 * directly and is for records nothing ever auto-titles.
 *
 * Writing to `display_name` rather than `name` is what makes this safe
 * to call freely, without asking whether the modeler has ever touched
 * the item: `display_name` is never written by anything but a person,
 * read ahead of `name` everywhere the app draws a title (`captionOf`,
 * lib/derive.ts), and — the property `name` itself could never quite
 * offer — genuinely *absent* when nobody has set one, rather than a
 * blank value that still has to answer whose it is.
 */
export function setDisplayName(item: Item, displayName: string): Change {
  const next = displayName.trim();
  const data = next ? withEntry(item.data, "display_name", next, "string") : withoutEntry(item.data, "display_name");
  return swap(item, { ...item, data }, next ? `Rename to '${next}'` : "Clear the name");
}

/** What the user said this is, in their own words — usually captured
 * once at intake, but not locked after that: nothing about the model
 * marks it immutable, so this lets a later edit correct or clear it. */
export function setDescription(item: Item, description: string): Change {
  const next = description.trim();
  const data = next ? withEntry(item.data, "description", next, "string") : withoutEntry(item.data, "description");
  return swap(
    item,
    { ...item, data },
    next ? `Describe ${describe(item)} as '${next}'` : `Clear ${describe(item)}'s description`,
  );
}

export function setDateAdded(item: Item, dateAdded: string): Change {
  return swap(
    item,
    { ...item, date_added: dateAdded },
    `Move ${describe(item)} to ${dateAdded}`,
  );
}

/** The resource's own date — a photo's shot date, a book's publication
 * date — distinct from `date_added`, which is when it entered the index.
 * Passing null clears it back to unknown. */
export function setDateCreated(item: Item, dateCreated: string | null): Change {
  const data = dateCreated
    ? withEntry(item.data, "date_created", dateCreated, "date")
    : withoutEntry(item.data, "date_created");
  return swap(
    item,
    { ...item, data },
    dateCreated
      ? `Set ${describe(item)}'s date to ${dateCreated}`
      : `Clear ${describe(item)}'s date`,
  );
}

/** The presentation override — written only when the inference is wrong
 * (DESIGN-CONCEPT §5). Passing null retires it and lets the cascade
 * decide again — "default" is the retired state, not an absent field. */
export function setLayout(item: Item, layout: string | null): Change {
  return swap(
    item,
    { ...item, layout: layout ?? "default" },
    layout ? `Open ${describe(item)} as ${layout}` : `Let ${describe(item)} choose how it opens`,
  );
}

/** The classification — written by the classifier's guess, or by the
 * user correcting it. Passing null clears it, same as `setLayout`. */
/**
 * Only the type picker reaches this, so every call is a decision the user
 * made — which is what `type`'s `prov` records, and what stops the
 * classifier ever arguing with it (lib/resources.ts).
 *
 * Clearing removes the `type` entry rather than pinning "user" on an
 * empty one: clearing withdraws an opinion instead of asserting one, so
 * a later primary resource is free to be guessed from again.
 */
export function setType(item: Item, type: string | null): Change {
  const data = type ? withEntry(item.data, "type", type, "string") : withoutEntry(item.data, "type");
  return swap(
    item,
    { ...item, data },
    type ? `Classify ${describe(item)} as ${type}` : `Clear the type on ${describe(item)}`,
  );
}

/**
 * Accept the classifier's guess as your own.
 *
 * Changes nothing about *what* the type is — only who stands behind it,
 * which is what decides whether a later primary resource may overrule it
 * (lib/resources.ts). Choosing a type by hand already does this, so this
 * exists for the one case that gesture doesn't cover: agreeing with what
 * was guessed, which otherwise has no way to be said.
 *
 * There is no route back. `clear` reopens guessing, and wanting to keep
 * an answer while inviting the classifier to overrule it is not a thing
 * anyone means — the way to change a type is to change it.
 */
export function confirmType(item: Item): Change {
  const data = item.data.type ? { ...item.data, type: { ...item.data.type, prov: "user" as const } } : item.data;
  return swap(
    item,
    { ...item, data },
    `Confirm ${describe(item)} is a ${item.data.type?.value}`,
  );
}

/**
 * `parse` — what the item's resource says about itself, written into the
 * fields its type declares.
 *
 * Three rules, and each is a decision about whose work is at stake:
 *
 * - **Blanks only**, for every field but the name. A field carrying a
 *   value is left exactly as it is. Undo makes an overwrite recoverable,
 *   not acceptable: the point of parsing an item you already curated is
 *   to finish it, not to argue with it.
 * - **The name is always taken when parsing found one.** Nothing of the
 *   user's is ever at stake here: `name` is the modeler's own field
 *   (item-modeler's `apply-modeling-result.ts` writes it the same
 *   unconditional way), and what a person actually chose to call the
 *   item lives in `display_name` — read ahead of `name` everywhere a
 *   title is drawn (`captionOf`), never touched by this function.
 * - **The type becomes yours.** Asking for a book's fields to be filled
 *   in is saying it is a book, so parsing confirms the guess the same
 *   way choosing a type by hand does. Nothing gets filled from a guess
 *   nobody has endorsed.
 * - **Nothing to do is null**, not an empty change — a verb that always
 *   reports success teaches you to stop reading it.
 */
export function parseItem(item: Item, found: { name?: string; entries: DataEntry[] }): Change | null {
  const has = (attribute: string) => {
    const entry = item.data[attribute.toLowerCase()];
    return entry !== undefined && !isBlankFieldValue(entry.value);
  };

  // Extraction-produced entries are never null-attribute.
  const filled = found.entries.filter((entry) => !has(entry.attribute as string));
  const takesName = Boolean(found.name) && found.name !== item.data.name.value;
  const confirms = Boolean(item.data.type) && item.data.type?.prov !== "user";
  if (filled.length === 0 && !takesName && !confirms) return null;

  // A found entry replaces the entry already standing for it, rather
  // than landing beside it — the layout draws a type's declared
  // attributes whether or not they carry anything, so a second key
  // would show the name twice with one of them empty.
  let data = item.data;
  for (const entry of filled) data = { ...data, [(entry.attribute as string).toLowerCase()]: entry };
  // Machine-derived, like every other entry `found` supplies — not a
  // decision the user made, so it carries the same provenance they do.
  if (takesName) data = { ...data, name: { attribute: "name", value: found.name as string, kind: "string", prov: "auto" } };
  if (item.data.type) data = { ...data, type: { ...item.data.type, prov: "user" as const } };

  const what = [...(takesName ? ["name"] : []), ...filled.map((entry) => entry.attribute ?? "")];
  return swap(
    item,
    { ...item, data },
    what.length > 0
      ? `Parse ${describe(item)}: filled ${list(what)}`
      : `Confirm ${describe(item)} is a ${item.data.type?.value}`,
  );
}

/** `a, b and c` — a description is read, not parsed. */
function list(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1] as string}`;
}

/** The keys in `data` that describe the item itself rather than a
 * generic attribute — never touched by `setData`, which replaces
 * everything else. */
export const RESERVED_DATA_KEYS = ["name", "display_name", "description", "date_created", "type"] as const;

/** Blank rows vanish on commit — an explicitly empty name and value is a
 * row the user abandoned, not a fact. A null attribute is a freeform tag,
 * a legitimate state on its own, not an abandoned row, and gets a fresh
 * generated key (ordering doesn't matter, so there's no reason to try to
 * preserve the old one). */
export function setData(item: Item, entries: DataEntry[]): Change {
  const kept = entries.filter((entry) => entry.attribute !== "" || !isBlankFieldValue(entry.value));
  const data: Data = { name: item.data.name };
  for (const key of RESERVED_DATA_KEYS) {
    if (key === "name") continue;
    const existing = item.data[key];
    if (existing) data[key] = existing;
  }
  for (const entry of kept) data[entry.attribute ? entry.attribute.toLowerCase() : ulid()] = entry;
  return swap(item, { ...item, data }, `Edit fields on ${describe(item)}`);
}

/** Upsert exactly one named attribute, leaving everything else in
 * `data` untouched, as opposed to `setData`'s "here is the complete
 * generic list" replacement. */
export function setAttribute(item: Item, attribute: string, value: DataEntry["value"], kind: DataEntry["kind"]): Change {
  return swap(
    item,
    { ...item, data: withEntry(item.data, attribute, value, kind) },
    `Edit ${attribute} on ${describe(item)}`,
  );
}

/** Drop the same freeform tag onto many items at once, as a single
 * change — the command bar's `tag` verb, batching what the Focus tag
 * composer (`DataFields`) does one item at a time. Not `tagMany`: that
 * one draws a connection into a set, this one just appends a value-only
 * entry to `data`, so each item gets its own fresh generated key rather
 * than sharing any name to collide on. */
export function addTagMany(items: Item[], text: string): Change {
  return {
    description: `Tag ${countOf(items.length, "item")} '${text}'`,
    pairs: items.map((item) => ({
      before: item,
      after: { ...item, data: { ...item.data, [ulid()]: { attribute: null, value: text, kind: "string", prov: "user" } } },
    })),
  };
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

/** Every live descendant of a parent, however many levels deep. Nesting
 * is only ever exercised one level today (an album's tracks), but a
 * `child: true` connection carries no depth limit of its own, so a
 * caller asking to delete "recursively" gets an actual recursive walk
 * rather than one level's worth with a grandchild silently left behind.
 * The `seen` set is both the cycle guard and the dedup — a child reached
 * two ways is still one pair in the eventual change. */
function descendantsOf(parentId: string, seen: Set<string> = new Set()): Item[] {
  const found: Item[] = [];
  for (const connection of pool.childrenOf(parentId)) {
    if (seen.has(connection.target)) continue;
    seen.add(connection.target);
    const child = pool.getItem(connection.target);
    if (!child) continue;
    found.push(child, ...descendantsOf(child.id, seen));
  }
  return found;
}

/**
 * Deleting an item soft-deletes its live connections in the same change,
 * as explicit pairs, so undo restores them symmetrically. System items
 * refuse deletion.
 *
 * A thin wrapper over `deleteMany` (below), which does the actual work —
 * every delete surface (FocusToolbar.tsx, the item context menu, the
 * selection's ⌘⌫) ends up asking the same question about the same
 * `recursive` option, so there is exactly one place that answers it.
 */
export function deleteItem(item: Item, options: { recursive?: boolean } = {}): Change | null {
  if (isSystemId(item.id)) return null;
  return deleteMany([item], options);
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
 *
 * `recursive` folds every live descendant of every deletable item into
 * the same change too, deduped against the items already going (a
 * child that happens to also be explicitly selected is still one pair) —
 * the alternative is severing it loose as a standalone item without ever
 * having asked.
 */
export function deleteMany(items: Item[], options: { recursive?: boolean } = {}): Change {
  const at = now();
  const deletable = items.filter((item) => !isSystemId(item.id));

  const targets = new Map<string, Item>(deletable.map((item) => [item.id, item]));
  let childCount = 0;
  if (options.recursive) {
    for (const item of deletable) {
      for (const child of descendantsOf(item.id)) {
        if (isSystemId(child.id) || targets.has(child.id)) continue;
        targets.set(child.id, child);
        childCount += 1;
      }
    }
  }

  const connections = new Map<string, Connection>();
  for (const target of targets.values()) {
    for (const connection of pool.connectionsTouching(target.id)) {
      // A connection between two doomed items is touched by both; the map
      // keeps one pair for it, because two would undo each other.
      connections.set(connection.id, connection);
    }
  }

  const description =
    deletable.length === 1
      ? childCount > 0
        ? `Delete ${describe(deletable[0] as Item)} and ${childCount} ${childCount === 1 ? "child" : "children"}`
        : `Delete ${describe(deletable[0] as Item)}`
      : `Delete ${countOf(targets.size, "item")}`;

  return {
    description,
    pairs: [
      ...[...targets.values()].map((item) => ({ before: item, after: { ...item, deleted_at: at } })),
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
