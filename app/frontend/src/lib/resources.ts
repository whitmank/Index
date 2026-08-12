// Authored by Karter Whitman using Claude Opus 5
// Attaching, promoting and detaching a resource — the three gestures that
// can change which resource is an item's *primary*, and so the only ones
// allowed to reopen the question of what the item is.
//
// These live here rather than in changes/catalog.ts because they have to
// ask the backend before they can compose anything, and a catalog
// constructor is a synchronous pure function. lib/intake.ts is the same
// shape for the same reason.
//
// The rule, in one place:
//
//   1. A change to `resources[0]` re-runs classification and records the
//      answer as "auto".
//   2. Unless `type_source` is "user" — a type someone chose is never
//      argued with, only replaced by them.
//   3. A null guess never clears a type. The classifier having no opinion
//      is not the same as the item having no type.
//   4. Appending past position 0 never classifies. The primary resource
//      is the subject; the ones after it are references about it — an
//      IMDb page attached to a film says nothing about what the film is.
//
// Reclassification rewrites `type` and never `fields`. A type is one word
// the classifier owns; fields are a table the user may have filled in by
// hand, and quietly rewriting that on a reorder would cost more than a
// stale row does. Extraction stays where it was: at intake, once.
import type { Change, Item, Resource } from "@index/database/types";
import { changes } from "../changes/index.js";

function primaryUri(item: Item): string | undefined {
  return item.resources[0]?.uri;
}

/** The item as this change will leave it — every constructor used here
 * emits exactly one item pair. */
function outcomeOf(change: Change): Item | null {
  const after = change.pairs[0]?.after;
  return after && "resources" in after ? (after as Item) : null;
}

/**
 * The change as given, unless it swapped out the primary resource and the
 * classifier has something to say about the new one — in which case the
 * type rides along in the *same* pair, so one undo puts both the order
 * and the type back and the reclassification is never something the user
 * has to unwind separately.
 */
async function withReclassification(before: Item, change: Change): Promise<Change> {
  if (before.type_source === "user") return change;

  const after = outcomeOf(change);
  const promoted = after?.resources[0];
  if (!after || !promoted || primaryUri(before) === promoted.uri) return change;

  const answer = await window.index.ingest.classify(promoted.uri, promoted.name);
  const type = "err" in answer ? null : answer.ok.type;
  if (!type || type === before.type) return change;

  const pair = change.pairs[0];
  if (!pair) return change;

  return {
    description: `${change.description}, reclassified as ${type}`,
    pairs: [{ ...pair, after: { ...after, type, type_source: "auto" } }, ...change.pairs.slice(1)],
  };
}

/** Appended, so it is only ever the primary on an item that had none. */
export async function attachResource(item: Item, resource: Resource): Promise<Change> {
  return withReclassification(item, changes.addResource(item, resource));
}

/** Moving something to position 0 is how the user says what the item is —
 * which is exactly why the type follows it there. */
export async function moveResource(item: Item, from: number, to: number): Promise<Change> {
  return withReclassification(item, changes.reorderResources(item, from, to));
}

/** Removing the primary promotes whatever was behind it, and the same
 * rule applies: a different subject, so a different guess. */
export async function detachResource(item: Item, index: number): Promise<Change> {
  return withReclassification(item, changes.removeResource(item, index));
}
