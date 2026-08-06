// Authored by Karter Whitman using Claude Opus 4.8
// Loads: the only way records enter the pool from outside. Everything
// here merges rather than replaces, so a set load never drops what
// another view put there (PRODUCT-SPEC §3.2).
import type { Item, MembersOptions, StoredRecord } from "@index/database/types";
import * as errors from "./errors.js";
import * as pool from "./pool.js";

/** One set, or one page of it. Returns the member ids in order, which is
 * what a view actually renders — the records themselves live in the pool. */
export async function loadSet(setId: string, options?: MembersOptions): Promise<string[]> {
  const answer = await window.index.sets.members(setId, options);
  if ("err" in answer) {
    errors.surface(answer.err);
    return [];
  }

  const records: StoredRecord[] = [...answer.ok.items, ...answer.ok.arrows];
  pool.merge(records);
  pool.markPlaces(answer.ok.places);
  return answer.ok.items.map((item) => item.id);
}

/** One item and its connections, with the far-end items merged in so the
 * focus view can draw its chips without a second round trip. */
export async function loadItem(id: string): Promise<Item | null> {
  const answer = await window.index.items.get(id);
  if ("err" in answer) {
    errors.surface(answer.err);
    return null;
  }

  const { item, inbound, outbound } = answer.ok;
  pool.merge([
    item,
    ...inbound.map((edge) => edge.connection),
    ...outbound.map((edge) => edge.connection),
  ]);
  return item;
}

/** Every set the home screen can list. Returns their ids in the backend's
 * order (seeds first); the set items themselves land in the pool. */
export async function loadSets(): Promise<string[]> {
  const answer = await window.index.sets.list();
  if ("err" in answer) {
    errors.surface(answer.err);
    return [];
  }
  const ids = answer.ok.sets.map((set) => set.id);
  pool.merge(answer.ok.sets);
  // Everything this returns plays the set role by definition.
  pool.markPlaces(ids);
  return ids;
}

/**
 * Search, as a load: the hits go into the pool and their roles are marked
 * before anyone sees them. That is what lets the caller hand a hit
 * straight to `goTo` — the pool already knows whether it is a place to
 * enter or a thing to open.
 */
export async function searchItems(term: string, limit?: number): Promise<Item[]> {
  const answer = await window.index.items.search(term, limit);
  if ("err" in answer) {
    errors.surface(answer.err);
    return [];
  }
  pool.merge(answer.ok.items);
  pool.markPlaces(answer.ok.places);
  return answer.ok.items;
}

/** The dates a set has members on — what the calendar popover marks. */
export async function loadSetDates(setId: string): Promise<string[]> {
  const answer = await window.index.sets.dates(setId);
  if ("err" in answer) {
    errors.surface(answer.err);
    return [];
  }
  return answer.ok;
}
