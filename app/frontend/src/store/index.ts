// Authored by Karter Whitman using Claude Opus 4.8
// The store's surface: the record pool, the loads that fill it, the
// history, and the error channel.
export * as pool from "./pool.js";
export * as selection from "./selection.js";
export * as history from "./history.js";
export * as errors from "./errors.js";

export { loadItem, loadSet, loadSetDates, loadSets, searchItems } from "./load.js";
export { listen as listenForRemoteChanges } from "./remote.js";
export { useHistory, usePool, useSelection, useTroubles } from "./hooks.js";
export type { Trouble } from "./errors.js";
export { useViewMode, VIEW_MODES, VIEW_MODE_GLYPH, type ViewMode } from "./viewMode.js";
