// Authored by Karter Whitman using Claude Sonnet 5
// OS file drop, wherever it lands: one item per file, classified and
// ingested by the backend's intake pipeline (services/intake.ts),
// dated onto the given day — today's, unless a specific page is in
// view. Shared by every drop target so each is a one-line call rather
// than its own copy of the loop.
import type { Item } from "@index/database/types";
import { apply, changes } from "../changes/index.js";

/** Returns the items that actually landed, in drop order — so a caller
 * can open the last one (PRODUCT-SPEC precedent: `+` opens what it just
 * made) regardless of how many files came in at once. */
export async function createItemsFromPaths(paths: string[], date?: string): Promise<Item[]> {
  if (paths.length === 0) return [];
  const answer = await window.index.intake.pathsToResources(paths);
  if ("err" in answer) return [];

  const drafts = answer.ok.results.map(({ resource, type, fields }) => ({
    ...changes.blankItem(date),
    name: resource.name,
    resources: [resource],
    type,
    fields,
  }));

  const landed = await Promise.all(drafts.map((item) => apply(changes.createItem(item))));
  return drafts.filter((_, index) => landed[index]);
}
