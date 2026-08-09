// Authored by Karter Whitman using Claude Opus 4.8
// The record pool: the client's live copy of items and connections
// (DESIGN-CONCEPT §6). Loads merge into it, changes are applied to it
// optimistically before they are sent, and a failed write puts the
// `before` states back.
//
// Subscription is a version counter rather than an immutable snapshot.
// Views read whatever they need from the map on render; at personal
// scale — thousands of records, not millions — a re-render on any change
// is cheaper than maintaining per-selector memoisation, and far less
// machinery to be wrong.
import type { ChangePair, Connection, Item, StoredRecord } from "@index/database/types";

type Listener = () => void;

const records = new Map<string, StoredRecord>();
const listeners = new Set<Listener>();
/** Ids the backend has told us play the set role. */
const marked = new Set<string>();
let version = 0;

function announce(): void {
  version += 1;
  for (const listener of listeners) listener();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getVersion(): number {
  return version;
}

export function isItem(record: StoredRecord): record is Item {
  return record.id.startsWith("items:");
}

export function isConnection(record: StoredRecord): record is Connection {
  return record.id.startsWith("connections:");
}

export function get(id: string): StoredRecord | undefined {
  return records.get(id);
}

export function getItem(id: string): Item | undefined {
  const record = records.get(id);
  return record && isItem(record) ? record : undefined;
}

export function getConnection(id: string): Connection | undefined {
  const record = records.get(id);
  return record && isConnection(record) ? record : undefined;
}

/** Everything the pool holds, for selectors that need to scan. */
export function all(): StoredRecord[] {
  return [...records.values()];
}

/**
 * Fold records in from a load or from a write's answer. A record that
 * arrives carrying `deleted_at` is removed rather than stored: the pool
 * holds what is live, and every read behind the bridge filters the
 * deleted out. Without this a soft delete would undo itself — the write's
 * own answer would put the record straight back.
 */
export function merge(incoming: StoredRecord[]): void {
  if (incoming.length === 0) return;
  for (const record of incoming) {
    if (record.deleted_at) records.delete(record.id);
    else records.set(record.id, record);
  }
  announce();
}

/** Drop everything — used when the store is reset between sessions or
 * tests. Loads re-fill it. */
export function clear(): void {
  records.clear();
  marked.clear();
  announce();
}

/** Remember which ids the backend says play the set role. */
export function markPlaces(ids: string[]): void {
  if (ids.length === 0) return;
  let added = false;
  for (const id of ids) {
    if (!marked.has(id)) {
      marked.add(id);
      added = true;
    }
  }
  if (added) announce();
}

/**
 * Whether an item is somewhere you can go, rather than something you
 * open. The backend's answer is authoritative and arrives with a load;
 * the local reading is what makes a place that was *just made* one —
 * tag something into an item and the arrow is in the pool immediately,
 * so the item becomes enterable without waiting for a refresh.
 */
export function isPlace(id: string): boolean {
  if (marked.has(id)) return true;

  const item = getItem(id);
  if (!item) return false;
  if (item.query !== null) return true;
  if (item.is_set) return true;
  return inboundTo(id).some((connection) => connection.label === null);
}

/**
 * Put a change's `after` states into the pool. A pair whose `after` is
 * null removes the record outright (that is what undoing a creation
 * means); a soft-deleted record is removed from the pool too, since every
 * read filters it — the pool holds what is live.
 */
export function applyPairs(pairs: ChangePair[]): void {
  for (const pair of pairs) {
    const { after, before } = pair;
    if (!after) {
      if (before) records.delete(before.id);
      continue;
    }
    if (after.deleted_at) records.delete(after.id);
    else records.set(after.id, after);
  }
  announce();
}

/** Put a change's `before` states back — the revert path when a write
 * fails. Symmetric with applyPairs, read the other way. */
export function revertPairs(pairs: ChangePair[]): void {
  for (const pair of pairs) {
    const { after, before } = pair;
    if (!before) {
      if (after) records.delete(after.id);
      continue;
    }
    if (before.deleted_at) records.delete(before.id);
    else records.set(before.id, before);
  }
  announce();
}

// ── selectors ───────────────────────────────────────────────────────────

export function connections(): Connection[] {
  return all().filter(isConnection);
}

/** The live connection for exactly this statement, if the pool has it.
 * Change constructors ask first, which is what keeps the arrow upsert
 * rule (PRODUCT-SPEC §1.2) true: one live arrow per (source, target,
 * label), updated rather than duplicated. */
export function findConnection(
  source: string,
  target: string,
  label: string | null = null,
): Connection | undefined {
  return connections().find(
    (connection) =>
      connection.source === source &&
      connection.target === target &&
      connection.label === label &&
      !connection.deleted_at,
  );
}

/** Every live connection touching an item, in either direction — what a
 * delete change has to carry along. */
export function connectionsTouching(itemId: string): Connection[] {
  return connections().filter(
    (connection) =>
      !connection.deleted_at &&
      (connection.source === itemId || connection.target === itemId),
  );
}

export function outboundFrom(itemId: string): Connection[] {
  return connections().filter(
    (connection) => connection.source === itemId && !connection.deleted_at,
  );
}

export function inboundTo(itemId: string): Connection[] {
  return connections().filter(
    (connection) => connection.target === itemId && !connection.deleted_at,
  );
}

/** Every live connection strictly between two ids in the given set — the
 * relations a canvas draws as edges. Excludes the placement arrow that
 * anchors a member to the set containing it (that arrow's other end is
 * the set itself, which is never a member of its own canvas), so this
 * only surfaces relations the user actually drew between two things. */
export function connectionsAmong(itemIds: readonly string[]): Connection[] {
  const ids = new Set(itemIds);
  return connections().filter(
    (connection) =>
      !connection.deleted_at &&
      connection.source !== connection.target &&
      ids.has(connection.source) &&
      ids.has(connection.target),
  );
}

/** The arrows into a set, in the order a list view reads them: manual
 * `order` first where it exists, then by when they were made. */
export function arrowsInto(setId: string): Connection[] {
  return inboundTo(setId)
    .filter((connection) => connection.label === null)
    .sort((a, b) => {
      if (a.order !== null && b.order !== null) return a.order - b.order;
      if (a.order !== null) return -1;
      if (b.order !== null) return 1;
      return a.created_at.localeCompare(b.created_at);
    });
}
