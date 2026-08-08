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

/**
 * Whether a set holds everything by description rather than by anyone
 * putting things in it. Nothing can be taken out of such a set: the
 * arrow you would withdraw is not what is keeping the item there.
 *
 * Named once because two paths ask it — the context menu about one item,
 * the ⌫ key about a selection — and they must not disagree.
 */
export function holdsEverything(set: Item): boolean {
  return set.query !== null && "all" in set.query;
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
