// Authored by Karter Whitman using Claude Sonnet 5
// Where the trail was left, so a refresh reopens the same place instead of
// falling back to `~`. Persisted to localStorage like viewMode.ts — a UI
// preference, not content — but read once at startup and written on every
// arrival rather than kept live across windows: each window is its own
// desktop's view (windowBehavior/windows.ts), not a shared opinion the way
// the view-mode toggle is.
import { HOME_SET_ID } from "../lib/seeds.js";

/** One position on the trail — a space you walked into, or a thing you
 * opened. `open` is what App.tsx's `goTo`/`enter` split used to keep as
 * separate state entirely (a `Focus` overlay, never in the trail); now
 * it's just another kind of entry, so the address bar remembers it and a
 * refresh can restore it. */
export interface PathEntry {
  id: string;
  /** True: this id is being opened as itself (Focus-style detail) rather
   * than entered (walked into, rendering its members). */
  open: boolean;
  /** Only meaningful with `open: true` — a still-blank item created by
   * the gesture that opened it; abandoning it discards it (App.tsx's
   * `arriveAt`). */
  isNew: boolean;
}

const STORAGE_KEY = "index:path";

export function homeEntry(): PathEntry {
  return { id: HOME_SET_ID, open: false, isNew: false };
}

function isPathEntry(value: unknown): value is PathEntry {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.open === "boolean" &&
    typeof candidate.isNew === "boolean"
  );
}

function isPath(value: unknown): value is PathEntry[] {
  return Array.isArray(value) && value.length > 0 && value.every(isPathEntry);
}

/** The trail as it was left, or the floor if there was none — same
 * fallback `App.tsx` already starts from. A plain `string[]` left over
 * from an older build fails `isPath` the same as any other corrupt
 * value, and falls back the same way — no migration needed. */
export function readStoredPath(): PathEntry[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [homeEntry()];
  try {
    const parsed: unknown = JSON.parse(stored);
    return isPath(parsed) ? parsed : [homeEntry()];
  } catch {
    return [homeEntry()];
  }
}

export function storePath(path: PathEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(path));
}
