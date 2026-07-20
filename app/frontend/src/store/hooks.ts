// Authored by Karter Whitman using Claude Opus 4.8
// How components read the store. Each hook subscribes to one version
// counter and then reads through a selector on render — see pool.ts for
// why the pool is versioned rather than snapshotted.
import { useSyncExternalStore } from "react";
import * as errors from "./errors.js";
import * as history from "./history.js";
import * as pool from "./pool.js";

/** Re-render when the pool changes; the selector reads it. */
export function usePool<T>(select: () => T): T {
  useSyncExternalStore(pool.subscribe, pool.getVersion, pool.getVersion);
  return select();
}

export function useHistory<T>(select: () => T): T {
  useSyncExternalStore(history.subscribe, history.getVersion, history.getVersion);
  return select();
}

export function useTroubles(): errors.Trouble[] {
  useSyncExternalStore(errors.subscribe, errors.getVersion, errors.getVersion);
  return errors.current();
}
