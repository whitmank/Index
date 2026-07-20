// Authored by Karter Whitman using Claude Opus 4.8
// The mutation surface. A gesture handler imports from here and nowhere
// else: `changes.rename(...)` to say what happened, `apply(...)` to make
// it so.
export { apply, applyUntracked, redo, undo } from "./apply.js";
export * as changes from "./catalog.js";
