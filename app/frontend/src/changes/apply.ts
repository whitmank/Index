// Authored by Karter Whitman using Claude Opus 4.8
// The one path a mutation takes (ARCHITECTURE, "data flow"): build the
// change → apply it to the pool optimistically → send it across the
// bridge → on failure, put the `before`s back and surface the message.
//
// Undo is the same flow with the pairs swapped, which is why undo and
// redo go through `send` too and differ only in what they do to the
// history stacks.
import type { Change } from "@index/database/types";
import * as errors from "../store/errors.js";
import * as history from "../store/history.js";
import * as pool from "../store/pool.js";

async function send(change: Change): Promise<boolean> {
  pool.applyPairs(change.pairs);

  const answer = await window.index.changes.apply(change);
  if ("err" in answer) {
    pool.revertPairs(change.pairs);
    errors.surface(answer.err);
    return false;
  }

  // The database is the authority on what was written — timestamps and
  // defaults it filled in are only knowable from the answer.
  pool.merge(answer.ok.records);
  return true;
}

/**
 * Apply a change the user made. A change that fails to persist is not
 * recorded: the history has to describe the database, and a change that
 * never landed describes nothing.
 */
export async function apply(change: Change): Promise<boolean> {
  const ok = await send(change);
  if (ok) history.record(change);
  return ok;
}

/**
 * Apply a change without recording it. For the two cases where the user
 * did not really do anything: discarding a still-empty new item on
 * dismissal (PRODUCT-SPEC §3.4), and anything else that should not be
 * walked back into.
 */
export async function applyUntracked(change: Change): Promise<boolean> {
  return send(change);
}

export async function undo(): Promise<boolean> {
  const inverse = history.takeUndo();
  if (!inverse) return false;

  const ok = await send(inverse);
  if (!ok) history.restoreUndo();
  return ok;
}

export async function redo(): Promise<boolean> {
  const change = history.takeRedo();
  if (!change) return false;

  const ok = await send(change);
  if (!ok) history.restoreRedo();
  return ok;
}
