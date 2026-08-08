// Authored by Karter Whitman using Claude Opus 4.8
// The history: the stack of changes, with undo writing the `before`s back
// and redo the mirror (DESIGN-CONCEPT §6). Entries keep their description
// so a future history UI has something to say ("Rename to 'Dune'").
//
// [pinned by PRODUCT-SPEC §3.2] Session-scoped, cap 100. Persistence is
// deferred — changes are just records and would be cheap to store, but
// nothing yet needs undo to survive a launch.
import type { Change } from "@index/database/types";

const CAP = 100;

type Listener = () => void;

const listeners = new Set<Listener>();
let done: Change[] = [];
let undone: Change[] = [];
let version = 0;

function announce(): void {
  version += 1;
  for (const listener of listeners) listener();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getVersion(): number {
  return version;
}

/** The same change read backwards. Undo and redo are both this. */
export function invert(change: Change): Change {
  return {
    description: change.description,
    pairs: change.pairs.map((pair) => ({ before: pair.after, after: pair.before })),
  };
}

/** Record a change the user made. Doing something new discards the redo
 * branch — the ordinary meaning of taking a different path. */
export function record(change: Change): void {
  done = [...done, change].slice(-CAP);
  undone = [];
  announce();
}

export function canUndo(): boolean {
  return done.length > 0;
}

export function canRedo(): boolean {
  return undone.length > 0;
}

export function peekUndo(): Change | undefined {
  return done[done.length - 1];
}

export function peekRedo(): Change | undefined {
  return undone[undone.length - 1];
}

/** Move the top change onto the redo stack and hand back its inverse for
 * the caller to apply. Returns null when there is nothing to undo. */
export function takeUndo(): Change | null {
  const change = done[done.length - 1];
  if (!change) return null;
  done = done.slice(0, -1);
  undone = [...undone, change];
  announce();
  return invert(change);
}

/** The mirror: hand back the change itself, re-armed for undo. */
export function takeRedo(): Change | null {
  const change = undone[undone.length - 1];
  if (!change) return null;
  undone = undone.slice(0, -1);
  done = [...done, change];
  announce();
  return change;
}

/** An undo or redo that failed to persist has to go back where it came
 * from, or the stacks stop describing the database. */
export function restoreUndo(): void {
  const change = undone[undone.length - 1];
  if (!change) return;
  undone = undone.slice(0, -1);
  done = [...done, change];
  announce();
}

export function restoreRedo(): void {
  const change = done[done.length - 1];
  if (!change) return;
  done = done.slice(0, -1);
  undone = [...undone, change];
  announce();
}

export function entries(): { done: Change[]; undone: Change[] } {
  return { done, undone };
}

export function clear(): void {
  done = [];
  undone = [];
  announce();
}
