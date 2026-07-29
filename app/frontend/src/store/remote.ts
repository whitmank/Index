// Authored by Karter Whitman using Claude Opus 5
// Changes made in another window. Index runs one main process behind any
// number of windows, all of them showing the same database, so a write
// from one arrives here as news — the same shape a local change takes,
// minus the optimism, because it has already been written.
import type { Change, StoredRecord } from "@index/database/types";
import * as pool from "./pool.js";

/**
 * Start listening. Returns the function that stops, so a caller that
 * mounts this can unmount it — in practice the app listens for its whole
 * life and the renderer's teardown takes the listener with it.
 */
export function listen(): () => void {
  return window.index.on("records:changed", (change: Change, records: StoredRecord[]) => {
    // Pairs first, then records: the pairs carry deletions and the moves
    // between them, and the records are the database's own account of
    // what it wrote — timestamps and defaults included.
    pool.applyPairs(change.pairs);
    pool.merge(records);
  });
}
