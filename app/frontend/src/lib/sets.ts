// Authored by Karter Whitman using Claude Opus 4.8
import type { Item } from "@index/database/types";
import { HOME_SET_ID, PUBLIC_SET_ID, SPACES_SET_ID } from "./seeds.js";

/** The mark a place wears, wherever one is drawn — a node, a row, a
 * search hit. Places no longer differ by *which* view they open into
 * (that's a global toggle, not a per-item property), so there is one
 * mark, not one per kind. */
export const PLACE_GLYPH = "◍";

/**
 * Whether a set holds everything by description rather than by anyone
 * putting things in it. Nothing can be taken out of such a set: the
 * arrow you would withdraw is not what is keeping the item there.
 *
 * Named once because two paths ask it — the context menu about one item,
 * the ⌫ key about a selection — and they must not disagree.
 */
export function holdsEverything(set: Item): boolean {
  return typeof set.set === "object" && "all" in set.set;
}

/** The order sets are offered in, wherever they are listed: `~` first —
 * the front door — then `spaces`, then `public`, then the rest as they
 * came. */
export function orderSets(sets: Item[]): Item[] {
  const pinned = [HOME_SET_ID, SPACES_SET_ID, PUBLIC_SET_ID];
  const head = pinned.flatMap((id) => {
    const set = sets.find((candidate) => candidate.id === id);
    return set ? [set] : [];
  });
  return [...head, ...sets.filter((set) => !pinned.includes(set.id))];
}
