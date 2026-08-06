// Authored by Karter Whitman using Claude Opus 5
// Where the window was last left. Index is summoned and dismissed dozens
// of times a day, so the frame has to survive every hide and every quit —
// otherwise the user re-places it each morning.
import fs from "node:fs";
import { screen } from "electron";
import { WINDOW_FILE } from "../config.js";

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_SIZE = { width: 1280, height: 820 };

/** How much of the window has to land on a display for saved bounds to be
 * worth restoring. A window remembered on a monitor that is no longer
 * plugged in should come back to the main screen, not off the edge. */
const ON_SCREEN_MARGIN = 64;

function isSize(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function onSomeDisplay(bounds: Bounds): boolean {
  return screen.getAllDisplays().some(({ workArea }) => {
    const overlapX =
      Math.min(bounds.x + bounds.width, workArea.x + workArea.width) -
      Math.max(bounds.x, workArea.x);
    const overlapY =
      Math.min(bounds.y + bounds.height, workArea.y + workArea.height) -
      Math.max(bounds.y, workArea.y);
    return overlapX >= ON_SCREEN_MARGIN && overlapY >= ON_SCREEN_MARGIN;
  });
}

/** The remembered frame, or null when there isn't a usable one — no file
 * yet, a hand-edited file that no longer parses, or a position that no
 * longer exists. Every one of those means "open where you would have
 * opened anyway". Must be called after `app.whenReady()`: it reads the
 * display layout. */
export function loadBounds(): Bounds | null {
  let parsed: Partial<Bounds>;
  try {
    parsed = JSON.parse(fs.readFileSync(WINDOW_FILE, "utf8")) as Partial<Bounds>;
  } catch {
    return null;
  }

  const { x, y, width, height } = parsed;
  if (!isSize(x) || !isSize(y) || !isSize(width) || !isSize(height)) return null;
  // However small the user made it is how small they wanted it; only a
  // frame with no extent at all is refused, and that is a corrupt file
  // rather than a choice.
  if (width <= 0 || height <= 0) return null;

  const bounds = { x, y, width, height };
  return onSomeDisplay(bounds) ? bounds : null;
}

export function saveBounds(bounds: Bounds): void {
  try {
    fs.writeFileSync(WINDOW_FILE, `${JSON.stringify(bounds, null, 2)}\n`);
  } catch (error) {
    // Losing the frame is a papercut, not a failure: the app keeps running
    // and opens at the default size next time.
    console.error("[window] could not remember the frame:", error);
  }
}
