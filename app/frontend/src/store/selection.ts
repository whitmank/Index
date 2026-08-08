// Authored by Karter Whitman using Claude Opus 5
// What the user has picked out, and what "all" would mean right now.
// Versioned and subscribed exactly like the pool, for the same reason:
// selection spans surfaces — a canvas draws it, a list draws it, the
// batch bar acts on it — and threading it through props would mean
// every view between them knowing about a thing it does not do.
//
// The selection holds ids, not records. An item that leaves the pool
// (deleted, or undone into nonexistence) leaves the selection with it,
// which is why every read filters — nothing should be left counting
// ghosts.
//
// A selection also remembers *how* it was made. Merely pointing at
// something on a canvas picks it out, which is the lightest possible
// way to say "this one" — but only while nothing has been picked on
// purpose. The moment a marquee, a ⌘-click or ⌘A says something
// deliberate, pointing stops speaking, or moving the mouse would undo
// the sentence you just finished. Escape empties the selection and
// hands the voice back to the pointer.
import * as pool from "./pool.js";

type Listener = () => void;

const chosen = new Set<string>();
const listeners = new Set<Listener>();
/** The ids on screen right now — what ⌘A picks. Set by the visible view. */
let scope: string[] = [];
/** Whether what is chosen was chosen on purpose, rather than pointed at. */
let deliberate = false;
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
  deliberate = chosen.size > 0;
  announce();
}

/**
 * Point at something. It becomes the selection, but only while nothing
 * has been picked deliberately — pointing is the lightest way to say
 * "this one", and it lasts exactly as long as you are saying it.
 */
export function hover(id: string): void {
  if (deliberate && count() > 0) return;
  if (chosen.size === 1 && chosen.has(id)) return;
  chosen.clear();
  chosen.add(id);
  announce();
}

/**
 * Stop pointing at something. Only the pointer's own pick is dropped:
 * naming an id means that moving from one thing to the next — where the
 * arrival is heard before the departure — cannot clear the thing just
 * arrived at, and a deliberate pick is never touched.
 */
export function unhover(id: string): void {
  if (deliberate) return;
  if (chosen.size !== 1 || !chosen.has(id)) return;
  chosen.clear();
  announce();
}

/** Take exactly these — what a marquee that started on empty space means. */
export function replace(incoming: string[]): void {
  chosen.clear();
  for (const id of incoming) chosen.add(id);
  deliberate = chosen.size > 0;
  announce();
}

/** Add these to what is already picked — a marquee drawn with a modifier
 * held, which extends rather than starts over. */
export function add(incoming: string[]): void {
  for (const id of incoming) chosen.add(id);
  deliberate = chosen.size > 0;
  announce();
}

export function clear(): void {
  // Always drops the deliberate mark, even when there was nothing to
  // clear: an Escape is how you hand the voice back to the pointer.
  const wasEmpty = chosen.size === 0;
  chosen.clear();
  deliberate = false;
  if (!wasEmpty) announce();
}

/** Whether what is chosen was chosen on purpose. Pointing yields to it. */
export function isDeliberate(): boolean {
  return deliberate && count() > 0;
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
