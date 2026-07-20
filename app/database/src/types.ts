// Authored by Karter Whitman using Claude Opus 4.8
// The wire shapes: the single source of truth every layer speaks in. The
// repository absorbs the database-isms (record ids, NONE coercion,
// datetime objects) so nothing above this file has to know them.
//
// Vocabulary note: the connections table stores `in`/`out` because that
// is what a SurrealDB relation calls its endpoints. The wire shape says
// `source`/`target`, which is what the glossary calls them.

export type FieldKind = "string" | "number" | "date";

/** A scalar name/value statement on an item. */
export interface Field {
  name: string;
  value: string;
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
  cached?: CachedDerivations;
}

/** Derived from the primary resource; selects the renderer. Never stored. */
export type Format = "bare" | "image" | "markdown" | "book" | "video" | "link" | "file";

/** The view kinds a set can open as. */
export type ViewKind = "canvas" | "list" | "timeline";

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
  /** Presentation override: a layout key, or a view kind on a set. */
  opens: string | null;
  query: SetQuery | null;
  system: boolean;
  fields: Field[];
  /** Ordered; `resources[0]` is primary. */
  resources: Resource[];
  deleted_at: string | null;
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
