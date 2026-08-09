// Authored by Karter Whitman using Claude Opus 4.8
// The wire shapes: the single source of truth every layer speaks in. The
// repository absorbs the database-isms (record ids, NONE coercion,
// datetime objects) so nothing above this file has to know them.
//
// Vocabulary note: the connections table stores `in`/`out` because that
// is what a SurrealDB relation calls its endpoints. The wire shape says
// `source`/`target`, which is what the glossary calls them.

export type FieldKind = "string" | "number" | "date" | "list";

/** A name/value statement on an item. `list` is the one kind whose
 * value is several strings rather than one — a cast, say — everything
 * else is scalar. */
export interface Field {
  name: string;
  value: string | string[];
  kind: FieldKind;
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

export interface FieldPredicate {
  name: string;
  kind: FieldKind;
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
  | { field: FieldPredicate };

/** A stored query, on items playing the set role. */
export type SetQuery = { all: true } | { and: Predicate[] };

export interface Item {
  /** `items:01J…` — ULID, except the two seeds. */
  id: string;
  name: string;
  display_name: string | null;
  /** The intrinsic journal day, ISO `YYYY-MM-DD`. */
  date: string;
  created_at: string;
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
  /** A classification (e.g. "book"), naming a row in `schemas`. Guessed
   * at intake, user-overridable — the same shape as `opens`. Absence is
   * not an error: an untyped item just has no schema fields to show. */
  type: string | null;
  fields: Field[];
  /** Ordered; `resources[0]` is primary. */
  resources: Resource[];
  deleted_at: string | null;
}

/** One field a `type` is known to carry, and how to present it. */
export interface SchemaField {
  name: string;
  /** Display label; falls back to `name` when absent. */
  label: string | null;
  kind: FieldKind;
}

/**
 * A type's field list, as data — not a code table (PRODUCT-SPEC-style
 * "schema-free" extension applied one level up: adding a type is adding a
 * row, not shipping code). `name` is the classification key an item's
 * `type` matches, and is immutable once created — the id is minted from
 * it (`schemaId`), the same way a label's id is minted from its word.
 */
export interface Schema {
  /** `schemas:book` — slugified from `name`. */
  id: string;
  name: string;
  label: string | null;
  fields: SchemaField[];
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

/** Which shape a record in a change pair is. */
export function isItem(record: StoredRecord): record is Item {
  return record.id.startsWith(`${ITEMS_TABLE}:`);
}

export function isConnection(record: StoredRecord): record is Connection {
  return record.id.startsWith(`${CONNECTIONS_TABLE}:`);
}
