// Authored by Karter Whitman using Claude Opus 4.8
// The wire shapes: the single source of truth every layer speaks in. The
// repository absorbs the database-isms (record ids, NONE coercion,
// datetime objects) so nothing above this file has to know them.
//
// Vocabulary note: the connections table stores `in`/`out` because that
// is what a SurrealDB relation calls its endpoints. The wire shape says
// `source`/`target`, which is what the glossary calls them.

export type AttributeKind = "string" | "number" | "date" | "list";

/** Who supplied a value: the classifier/extractor's own guess, or a
 * choice the user made directly. */
export type Provenance = "auto" | "user";

/** A name/value statement on an item. `list` is the one kind whose
 * value is several strings rather than one — a cast, say — everything
 * else is scalar. `attribute` null means a freeform tag: a value with
 * no name, just content. */
export interface MetadataEntry {
  attribute: string | null;
  value: string | string[];
  kind: AttributeKind;
  prov: Provenance;
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

/** A classification (e.g. "book"), naming a row in `schemas`, paired
 * atomically with who decided it — one fact, not two fields that can
 * drift apart. The classifier may replace its own `"auto"` guess when
 * the primary resource changes, but never a `"user"` one. */
export interface ItemType {
  value: string;
  prov: Provenance;
}

export interface DateRange {
  gte?: string;
  lte?: string;
}

export interface MetadataPredicate {
  /** Absent matches any attribute — useful for a freeform-tag search. */
  attribute?: string;
  kind: AttributeKind;
  gte?: string;
  lte?: string;
  eq?: string;
}

/** The v1 predicate grammar (PRODUCT-SPEC §1.5). */
export type Predicate =
  | { date: DateRange }
  | { device: string }
  | { format: Format }
  | { arrowTo: string }
  | { metadata: MetadataPredicate };

/** A stored query, on items playing the set role. */
export type SetQuery = { all: true } | { and: Predicate[] };

export interface Item {
  /** `items:01J…` — ULID, except the two seeds. */
  id: string;
  name: string;
  display_name: string | null;
  /** What the user said this is, in their own words — captured once at
   * intake, optional, and freeform rather than derived. */
  description: string | null;
  /** ISO datetime, immutable — when the item entered the index. Set
   * once at creation (absorbs what used to be the separate `created_at`)
   * and never changed after; drives the `~` timeline's default
   * partition and default ordering. */
  date_added: string;
  /** ISO datetime, mutable, intrinsic to the resource itself — a
   * photo's shot date, a book's publication date — not when it was
   * indexed. Absent until a user sets it or a future extraction fills
   * it in; nothing populates it automatically yet. */
  date_created: string | null;
  /** Presentation override: a layout key (Focus's, not a view kind — how
   * you view a set's members is a global, application-level toggle now,
   * not remembered per set). */
  opens: string | null;
  query: SetQuery | null;
  system: boolean;
  /** Set at creation by `blankSet`: marks a deliberately-made set so it
   * stays visible on the home screen before it has a query or any
   * members. Set-role is otherwise computed, never stored — this is the
   * one deliberate exception, for the bootstrapping moment before either
   * exists yet. */
  is_set: boolean;
  /** Guessed at intake, user-overridable — the same shape as `opens`.
   * Null while untyped, and again after the type is cleared: clearing
   * withdraws an opinion rather than asserting an empty one, which
   * reopens guessing. Absence is not an error: an untyped item just has
   * no schema fields to show. */
  type: ItemType | null;
  metadata: MetadataEntry[];
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
   * metadata list below, which draws whatever the layout did not claim
   * (views/focus/FieldsEditor.tsx). An ISBN is worth having and rarely
   * worth looking at, and this is the difference.
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
 * leads — the ingestor writes what it extracted there into `Item.name`
 * (ingest/extract.ts) and the layout draws the rest (layouts/registry.tsx),
 * since the name is already on screen above them.
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
 * trigger for the set role (alongside `query`/`is_set`, which were always
 * explicit) — every other connection, labelled or not, is a plain
 * relationship and never promotes its target into something you can walk
 * into. Seeded once (seed.ts) with this well-known id, the same way `~`
 * and `public` are, so nothing has to mint it on first use.
 */
export const MEMBER_OF_LABEL_ID = "labels:member_of";

/** Which shape a record in a change pair is. */
export function isItem(record: StoredRecord): record is Item {
  return record.id.startsWith(`${ITEMS_TABLE}:`);
}

export function isConnection(record: StoredRecord): record is Connection {
  return record.id.startsWith(`${CONNECTIONS_TABLE}:`);
}
