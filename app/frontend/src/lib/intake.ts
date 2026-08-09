// Authored by Karter Whitman using Claude Sonnet 5
// OS file drop, wherever it lands: one item per file, classified and
// ingested by the backend's intake pipeline (services/intake.ts),
// dated onto the given day — today's, unless a specific page is in
// view. Shared by every drop target so each is a one-line call rather
// than its own copy of the loop.
import type { Item } from "@index/database/types";
import { apply, changes } from "../changes/index.js";
import { expandSpotifyAlbum } from "./spotify.js";

/** Returns the items that actually landed, in drop order — so a caller
 * can open the last one (PRODUCT-SPEC precedent: `+` opens what it just
 * made) regardless of how many files came in at once.
 *
 * A Spotify album link is still one path in, one item out here — its
 * songs ride along as extra pairs in the *same* `Change` that creates the
 * album item, so one undo takes the whole import back out, and every
 * other path in the same drop/paste still becomes its own separate item
 * with its own undo entry, exactly as before. */
export async function createItemsFromPaths(paths: string[], date?: string): Promise<Item[]> {
  if (paths.length === 0) return [];
  const answer = await window.index.intake.pathsToResources(paths);
  if ("err" in answer) return [];

  const drafts = answer.ok.results.map(({ resource, type, fields }) => ({
    resource,
    item: { ...changes.blankItem(date), name: resource.name, resources: [resource], type, fields } as Item,
  }));

  const created = await Promise.all(
    drafts.map(async ({ item, resource }) => {
      const expansion = await expandSpotifyAlbum(item, resource);
      if (!expansion) return { item, ok: await apply(changes.createItem(item)) };

      const named = { ...item, name: expansion.albumName, ...expansion.itemPatch };
      const change = {
        description: `Create '${expansion.albumName}' as an album`,
        pairs: [{ before: null, after: named }, ...expansion.extraPairs],
      };
      return { item: named, ok: await apply(change) };
    }),
  );
  return created.filter((entry) => entry.ok).map((entry) => entry.item);
}
