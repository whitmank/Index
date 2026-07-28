// Authored by Karter Whitman using Claude Opus 4.8
// A set opens in one of the three view kinds. Which one is its `opens`
// field when that names a view kind, and a fallback otherwise — the same
// field a regular item uses for its layout, read through the set role.
import type { Item, ViewKind } from "@index/database/types";

export const VIEW_KINDS: ViewKind[] = ["timeline", "canvas", "list"];

export function viewKindOf(set: Item, fallback: ViewKind = "timeline"): ViewKind {
  return (VIEW_KINDS as string[]).includes(set.opens ?? "")
    ? (set.opens as ViewKind)
    : fallback;
}
