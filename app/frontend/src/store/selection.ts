// Authored by Karter Whitman using Claude Opus 5
// What the user has picked out, and what "all" would mean right now.
// Versioned and subscribed exactly like the pool, for the same reason:
// selection spans surfaces — a canvas draws it, a list draws it, the
// batch bar acts on it — and threading it through props would mean
// every view between them knowing about a thing it does not do.
//
// The selection holds ids, not records. An item that leaves the pool
// (deleted, or undone into nonexistence) leaves the selection with it,
// which is why every read filters — a batch delete must not leave the
// bar counting ghosts.
import * as pool from "./pool.js";

type Listener = () => void;

const chosen = new Set<string>();
const listeners = new Set<Listener>();
/** The ids on screen right now — what ⌘A picks. Set by the visible view. */
let scope: string[] = [];
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

/** The live selection, in no particular order. */
export function ids(): string[] {
  return [...chosen].filter((id) => pool.getItem(id));
}

export function count(): number {
  return ids().length;
}

export function has(id: string): boolean {
  return chosen.has(id);
}

export function toggle(id: string): void {
  if (chosen.has(id)) chosen.delete(id);
  else chosen.add(id);
  announce();
}

/** Take exactly these — what a marquee that started on empty space means. */
export function replace(incoming: string[]): void {
  chosen.clear();
  for (const id of incoming) chosen.add(id);
  announce();
}

/** Add these to what is already picked — a marquee drawn with a modifier
 * held, which extends rather than starts over. */
export function add(incoming: string[]): void {
  for (const id of incoming) chosen.add(id);
  announce();
}

export function clear(): void {
  if (chosen.size === 0) return;
  chosen.clear();
  announce();
}

/**
 * What is on screen, told by the view that is drawing it. The timeline
 * mounts three canvases and only the centred one is real, so a view that
 * is not the one you are looking at says nothing.
 */
export function setScope(incoming: string[]): void {
  scope = incoming;
}

export function selectAll(): void {
  replace(scope);
}

/** Whether ⌘A would do anything — there is something on screen to take. */
export function hasScope(): boolean {
  return scope.length > 0;
}
