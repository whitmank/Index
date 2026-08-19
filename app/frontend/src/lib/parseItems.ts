// Authored by Karter Whitman using Claude Opus 5
// The `parse` verb, in one place because three surfaces say it: the
// command bar, the button in Focus, and the context menu. The same
// reason itemActions.ts exists — three ways to say a thing should not be
// three ideas of what it means.
//
// What it does: read the item's primary resource and fill in the fields
// its type declares, leaving anything already filled alone
// (changes/catalog.ts holds those rules).
//
// Why it is asked for rather than automatic: classifying a file is a
// guess and will stay one, but *given* a type, finding the values that
// belong to its fields is deterministic. So the reliable half is the
// half worth having a verb for — the user settles what the thing is,
// and this fills it in.
import type { Change, Item } from "@index/database/types";
import { apply, changes } from "../changes/index.js";

export interface ParseOutcome {
  /** Items that gained something — a field, a name, a confirmed type. */
  filled: number;
  /** Items that were read and had nothing to add. */
  unchanged: number;
  /** Items that could not be asked: no type, or no resource to read. */
  skipped: number;
}

/**
 * Parse every item that can be, as **one** change.
 *
 * One change rather than one per item so a run over a selection undoes
 * in a single gesture — the shape `tagMany` and `deleteMany` already
 * take, and for the same reason: what the user did was one act. A run
 * over exactly one item keeps that item's own description, since a
 * history entry reading "Parse 2 items" is worse than one naming what
 * was filled in.
 *
 * An item with no type is skipped rather than guessed at. That is the
 * premise of the verb, and the command bar says so before you ask.
 */
export async function parseItems(items: Item[]): Promise<ParseOutcome> {
  const outcome: ParseOutcome = { filled: 0, unchanged: 0, skipped: 0 };
  const made: Change[] = [];

  for (const item of items) {
    const resource = item.resources?.[0];
    if (!item.data.type || !resource) {
      outcome.skipped += 1;
      continue;
    }

    const answer = await window.index.ingest.parse(resource.uri, item.data.type.value as string);
    if ("err" in answer) {
      outcome.skipped += 1;
      continue;
    }

    // The name the item was minted with is the resource's own; if it
    // still carries that, nothing of the user's is at stake in replacing
    // it (changes/catalog.ts explains the rule).
    const change = changes.parseItem(item, answer.ok, resource.name);
    if (!change) {
      outcome.unchanged += 1;
      continue;
    }

    made.push(change);
    outcome.filled += 1;
  }

  const first = made[0];
  if (first) {
    await apply({
      description: made.length === 1 ? first.description : `Parse ${made.length} items`,
      pairs: made.flatMap((change) => change.pairs),
    });
  }
  return outcome;
}
