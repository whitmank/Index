// Authored by Karter Whitman using Claude Sonnet 5
// Search: the command bar's and the tag composer's lookup, and the
// rule-builder's attribute autocomplete. Built on the same evaluator
// sets/ uses (query/) — a text search is just a throwaway SetQuery, not
// a separate mechanism, so the two can never silently disagree about
// what "matches" means.
import { buildContext, matches } from "../query/index.js";
import { displayNameOf, listLiveItems, nameOf } from "../records/items.js";
import { listSchemas } from "../records/schemas.js";
import type { Item, SetQuery } from "../types.js";

/** What the caption reads as — the same choice the views draw. */
function captionOf(item: Item): string {
  return displayNameOf(item) ?? nameOf(item);
}

/** 0 exact, 1 prefix, 2 substring — the best of the two names. */
function matchRank(item: Item, needle: string): number {
  return Math.min(
    ...[nameOf(item), displayNameOf(item) ?? ""].map((name) => {
      const lowered = name.toLowerCase();
      if (lowered === needle) return 0;
      if (lowered.startsWith(needle)) return 1;
      return lowered.includes(needle) ? 2 : 3;
    }),
  );
}

/**
 * Name/display-name search. Substring, not prefix: you rarely remember
 * how a thing's name *starts*, and a bar you must spell into from the
 * left is a bar you stop reaching for.
 *
 * `matches()` narrows, then JS ranks: exact name over prefix over
 * substring, shorter names before longer ones at the same rank (the term
 * is a larger share of them), alphabetical last. Ranking has to happen
 * over the whole match population, so the limit is applied after it — at
 * personal scale a scan over freeform names is free (DESIGN-CONCEPT §8),
 * and limiting first would cut good matches off alphabetically.
 */
export async function searchItems(term: string, limit = 20): Promise<Item[]> {
  const needle = term.trim().toLowerCase();
  if (!needle) return [];

  const query: SetQuery = {
    or: [
      { data: { attribute: "name", kind: "string", contains: needle } },
      { data: { attribute: "display_name", kind: "string", contains: needle } },
    ],
  };

  // No arrowTo leaves in this query — buildContext is a cheap no-op here,
  // called anyway so search and set membership always share exactly one
  // matching path.
  const [items, ctx] = await Promise.all([listLiveItems(), buildContext(query)]);

  return items
    .filter((item) => matches(query, item, ctx))
    .sort((a, b) => {
      const byRank = matchRank(a, needle) - matchRank(b, needle);
      if (byRank !== 0) return byRank;
      const byLength = captionOf(a).length - captionOf(b).length;
      if (byLength !== 0) return byLength;
      return captionOf(a).localeCompare(captionOf(b));
    })
    .slice(0, limit);
}

/** Every attribute name worth suggesting while building a Space's rule:
 * every type's declared attributes, plus every named attribute actually
 * in use on a live item. Freeform tags (`attribute: null`) are excluded
 * — they're content, not a name a rule could target. */
export async function listDataAttributes(): Promise<string[]> {
  const [schemas, items] = await Promise.all([listSchemas(), listLiveItems()]);
  const names = new Set<string>();
  for (const schema of schemas) {
    for (const attribute of schema.attributes) names.add(attribute.attribute);
  }
  for (const item of items) {
    for (const entry of Object.values(item.data)) {
      if (entry.attribute) names.add(entry.attribute);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
