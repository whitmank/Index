// Authored by Karter Whitman using Claude Sonnet 5
// The classifier: a first guess at an item's type, run once at intake.
// The guess is stored (Item.type) and user-overridable from there — it
// is never recomputed, unlike `format`, which stays a live derivation.
import { formatOfResource } from "@index/database";
import type { Resource } from "@index/database/types";

/**
 * First match wins, same shape as the format ladder — but its own
 * ladder, not a proxy for it: v1's only rule happens to coincide with
 * `format` (an epub is unambiguously a book), but a later rule need not
 * (a recipe guessed from a markdown file's content, say).
 */
export function classifyResource(resource: Resource | undefined): string | null {
  if (formatOfResource(resource) === "book") return "book";
  return null;
}
