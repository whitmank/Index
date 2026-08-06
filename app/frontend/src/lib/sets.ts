// Authored by Karter Whitman using Claude Opus 4.8
// A set opens in one of the three view kinds. Which one is its `opens`
// field when that names a view kind, and a fallback otherwise — the same
// field a regular item uses for its layout, read through the set role.
import type { Item, ViewKind } from "@index/database/types";
import { HOME_SET_ID, PUBLIC_SET_ID } from "./seeds.js";

export const VIEW_KINDS: ViewKind[] = ["timeline", "canvas", "list"];

/** A glyph per view kind, so a place reads as one — and as *which* one —
 * wherever it is drawn: the home screen, a node, a row. */
export const VIEW_GLYPH: Record<ViewKind, string> = {
  timeline: "▦",
  canvas: "◍",
  list: "≣",
};

export function viewKindOf(set: Item, fallback: ViewKind = "timeline"): ViewKind {
  return (VIEW_KINDS as string[]).includes(set.opens ?? "")
    ? (set.opens as ViewKind)
    : fallback;
}

/** The order sets are offered in, wherever they are listed: `~` first —
 * the front door — then `public`, then the rest as they came. */
export function orderSets(sets: Item[]): Item[] {
  const pinned = [HOME_SET_ID, PUBLIC_SET_ID];
  const head = pinned.flatMap((id) => {
    const set = sets.find((candidate) => candidate.id === id);
    return set ? [set] : [];
  });
  return [...head, ...sets.filter((set) => !pinned.includes(set.id))];
}
