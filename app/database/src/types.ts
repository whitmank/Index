// Authored by Karter Whitman using Claude Opus 4.8
// The wire shapes: the single source of truth every layer speaks in. The
// repository absorbs the database-isms (record ids, NONE coercion,
// datetime objects) so nothing above this file has to know them.
//
// Vocabulary note: the connections table stores `in`/`out` because that
// is what a SurrealDB relation calls its endpoints. The wire shape says
// `source`/`target`, which is what the glossary calls them.

/** `duration`'s value is a plain integer-seconds string (`"3512"`), the
 * same "one canonical shape, format only on the way out" rule `date`
 * follows with its ISO string — never a formatted "58:32" or "59 min",
 * which the renderer derives instead (lib/duration.ts). */
export type AttributeKind = "string" | "number" | "date" | "list" | "duration";

/** Who supplied a value: the classifier/extractor's own guess, or a
 * choice the user made directly. */
export type Provenance = "auto" | "user";

/** A name/value statement on an item. `list` is the one kind whose
 * value is several strings rather than one — a cast, say — everything
 * else is scalar. `attribute` null means a freeform tag: a value with
 * no name, just content — stored under a generated key (see `Data`)
 * rather than its own value, so it can never collide with a real
 * attribute name and two identical tags don't silently merge. */
export interface DataEntry {
  attribute: string | null;
  value: string | string[];
  kind: AttributeKind;
  prov: Provenance;
}

/**
 * Everything about an item that's resource-descriptive and
 * app-displayed: name, description, classification, extracted
 * attributes, freeform tags. Keyed by `attribute.toLowerCase()` for a
 * named entry (matching is case-insensitive everywhere else in this
 * codebase; the key has to pick one canonical case, the entry's own
 * `attribute` field keeps the original for display) or a generated id
 * for a freeform tag.
 *
 * `name` is the one key guaranteed to exist — enforced here at compile
 * time (an explicit property alongside the index signature), and
 * backstopped by a database ASSERT (schema.surql) against anything that
 * bypasses TypeScript. `readonly` blocks both reassignment and deletion
 * of the key by name; a dynamic-key `delete data[someVariable]` still
 * needs its own runtime guard, which is the one case static typing
 * can't reach.
 */
export interface Data {
  readonly name: DataEntry;
  [key: string]: DataEntry;
}

/**
 * Derivations cached onto a resource. Every key is disposable and
 * rebuildable; absence is never an error.
 */
export interface CachedDerivations {
  mime?: string;
  thumbnail?: string;
  preview_image?: string;
  favicon?: string;
  card_title?: string;
  card_extract?: string;
}

/** An ordered pointer to an item's actual stuff. A pointer, never custody. */
export interface Resource {
  uri: string;
  name: string;
  /** sha256 hex of the file's bytes, captured while it still resolved.
   * Unlike `cached`, this can't be recomputed once the file is gone — it's
   * what makes relocation possible, not a rebuildable convenience. */
  contentHash?: string;
  size?: number;
  cached?: CachedDerivations;
}

/** Derived from the primary resource; selects the renderer. Never stored. */
export type Format = "bare" | "image" | "markdown" | "book" | "video" | "link" | "file";

export interface DateRange {
  gte?: string;
  lte?: string;
}

export interface DataPredicate {
  /** Absent matches any attribute — useful for a freeform-tag search. */
  attribute?: string;
  kind: AttributeKind;
  eq?: string;
  /** Substring match, case-insensitive — what lets search be expressed
   * as a SetQuery instead of its own separate mechanism. */
  contains?: string;
  gte?: string;
  lte?: string;
}

/** The predicate grammar (PRODUCT-SPEC §1.5, extended for Space). */
export type Predicate =
  | { date: DateRange }
  | { device: string }
  | { format: Format }
  | { arrowTo: string }
  | { data: DataPredicate };

/**
 * A stored query, on items playing the set role — a recursive boolean
 * tree, not a flat AND-list. Each combinator's children are `SetQuery`
 * itself, so grouping is syntactic (however deep the nesting) rather
 * than relying on operator-precedence rules: `(A AND B) OR (C AND D)` is
 * `{ or: [{ and: [A, B] }, { and: [C, D] }] }`, unambiguously.
 */
export type SetQuery =
  | { all: true }
  | { and: SetQuery[] }
  | { or: SetQuery[] }
  | { not: SetQuery }
  | Predicate;

/** An item's set-related state, in one field. `true` = deliberately
 * created as a set, no filter defined yet (the bootstrapping window
 * before it has one) — a `SetQuery` = it has a real filter. Both are
 * "this item is a set" states; only `false` means it isn't (though it
 * may still play the set role via a live `member of` arrow — that's
 * computed elsewhere, never stored, same as before). */
export type SetState = true | SetQuery;

export interface Item {
  /** `items:01J…` — ULID, except the two seeds. */
  id: string;
  /** ISO datetime, immutable — when the item entered the index. Set
   * once at creation (absorbs what used to be the separate `created_at`)
   * and never changed after; drives the `~` timeline's default
   * partition and default ordering. */
  date_added: string;
  /** Presentation override: a layout key (Focus's, not a view kind — how
   * you view a set's members is a global, application-level toggle now,
   * not remembered per set). `"default"` means "use the type's own
   * layout" — never absent, so a raw record is self-explanatory without
   * knowing what null would have meant. */
  layout: string;
  set: SetState | false;
  /** Everything resource-descriptive and app-displayed: name,
   * description, classification, extracted attributes, freeform tags. */
  data: Data;
  /** Ordered; `resources[0]` is primary. */
  resources: Resource[];
  deleted_at: string | null;
}

/** One attribute a `type` is known to carry, and how to present it. */
export interface SchemaAttribute {
  attribute: string;
  kind: AttributeKind;
  /**
   * Show this attribute in the laid-out block at the top of Focus.
   *
   * `false` is not a secret and not a deletion: the value is still
   * extracted, still stored, and still shown — it drops to the generic
   * data list below, which draws whatever the laid-out block did not
   * claim. An ISBN is worth having and rarely worth looking at, and this
   * is the difference.
   *
   * A flag rather than a position, unlike `attribute`, where an
   * attribute sits says which matters most, which is a different
   * question from whether it earns room up front. Defaults `true`.
   */
  display: boolean;
}

/**
 * A type's attribute list, as data — not a code table (PRODUCT-SPEC-style
 * "schema-free" extension applied one level up: adding a type is adding a
 * row, not shipping code).
 *
 * **`attributes[0]` is the item's name**, the same way `resources[0]` is
 * the primary resource: ordered, and reordering is how the user says
 * which one it is. A book's title is what the book is called, so it
 * leads — the ingestor writes what it extracted there into `Item.data.name`
 * (ingest/extract.ts), since the name is already on screen above the
 * rest of an item's fields.
 *
 * Positional rather than flagged because the word is no guide: a
 * `person` type's `title` means Dr. or a job, not a name. What decides
 * is where the user put it.
 *
 * `name` is the classification key an item's
 * `type` matches, and is immutable once created — the id is minted from
 * it (`schemaId`), the same way a label's id is minted from its word.
 */
export interface Schema {
  /** `schemas:book` — slugified from `name`. */
  id: string;
  name: string;
  attributes: SchemaAttribute[];
}

export interface Position {
  x: number;
  y: number;
}

export interface Connection {
  id: string;
  /** The item the statement is made about. */
  source: string;
  /** The item it points at. */
  target: string;
  /** Absent ⇒ arrow (belonging). Present ⇒ labelled connection. */
  label: string | null;
  /** Arrows only: offset from the canvas viewport centre. */
  position: Position | null;
  /** Arrows only: the item's manual place in a list of the target set. */
  order: number | null;
  /** `target` is a child of `source` — a third, orthogonal state on top
   * of `label`/unlabelled: a connection can be both a labelled relation
   * and a child at once. Drives hierarchy (nesting under a parent in the
   * canvas and list), not membership or `isPlace`. */
  child: boolean;
  created_at: string;
  deleted_at: string | null;
}

export interface Label {
  /** `labels:author` — the slugified name. */
  id: string;
  name: string;
}

/** Either record shape; what a change's pairs carry. */
export type StoredRecord = Item | Connection;

export interface ChangePair {
  /** `null` on creation. */
  before: StoredRecord | null;
  /** `null` only when undoing a creation; a delete carries `deleted_at`. */
  after: StoredRecord | null;
}

/** One user action: pairs applied atomically. Undo swaps them. */
export interface Change {
  description: string;
  pairs: ChangePair[];
}

/** One timeline page's worth of a set, or the whole set when absent. */
export interface MembersOptions {
  partition?: { date: string };
}

export interface Members {
  items: Item[];
  /** The live arrows into the set, carrying position and order. */
  arrows: Connection[];
  /** The live connections between two members — what a canvas draws as
   * edges. Distinct from `arrows`: those anchor a member to *this* set,
   * these are relations members hold between each other. */
  connections: Connection[];
  /**
   * Which of these members play the set role themselves — the ones the
   * shell can enter rather than open. Computed by the same rule as
   * `listSets`, because a member that is a place has to look like one
   * wherever it is drawn.
   */
  places: string[];
}

export interface ItemDetail {
  item: Item;
  inbound: ConnectionWithEndpoint[];
  outbound: ConnectionWithEndpoint[];
}

/** A connection resolved with the item at its far end. */
export interface ConnectionWithEndpoint {
  connection: Connection;
  endpoint: EndpointSummary;
}

/** A cheap projection of the far item, not the item itself — built from
 * `item.data.name`/`.display_name` (records/items.ts) so the focus view
 * can draw connection chips without a second round trip. */
export interface EndpointSummary {
  id: string;
  name: string;
  display_name: string | null;
}

export const ITEMS_TABLE = "items";
export const CONNECTIONS_TABLE = "connections";
export const LABELS_TABLE = "labels";
export const SCHEMAS_TABLE = "schemas";

// The wire id is whatever the SDK renders a record id as, so that ids
// compared in the renderer match ids read from the database. SurrealDB
// brackets only the ids that need it: `~` does, `public` does not — which
// is why the second of these is barer than PRODUCT-SPEC §1.4 writes it.
// The test asserts both, because guessing here is how ids silently stop
// matching. (The `surreal` CLI prints the same records with backticks — a
// different renderer, not a different id.)
export const HOME_SET_ID = "items:⟨~⟩";
export const PUBLIC_SET_ID = "items:public";

/**
 * The one reserved, structural label. `member of` is the sole label-based
 * trigger for the set role (alongside `set`, which is always explicit) —
 * every other connection, labelled or not, is a plain relationship and
 * never promotes its target into something you can walk into. Seeded
 * once (seed.ts) with this well-known id, the same way `~` and `public`
 * are, so nothing has to mint it on first use.
 */
export const MEMBER_OF_LABEL_ID = "labels:member_of";

/** Which shape a record in a change pair is. */
export function isItem(record: StoredRecord): record is Item {
  return record.id.startsWith(`${ITEMS_TABLE}:`);
}

export function isConnection(record: StoredRecord): record is Connection {
  return record.id.startsWith(`${CONNECTIONS_TABLE}:`);
}

/** Whether an item is one of the two fixed, built-in seeds — `~` and
 * `public` — rather than something the user made. Computed from `id`,
 * not stored: both ids are known constants, so there's no bootstrapping
 * gap like `set`'s `true` state exists to cover, and storing this
 * redundantly on every row would drift from the one thing that actually
 * decides it. */
export function isSystemId(id: string): boolean {
  return id === HOME_SET_ID || id === PUBLIC_SET_ID;
}
