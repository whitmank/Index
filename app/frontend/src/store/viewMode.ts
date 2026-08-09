// Authored by Karter Whitman using Claude Sonnet 5
// How you're looking at things — canvas or list — as one application-
// level preference, not a property any particular set remembers. Persisted
// to localStorage (survives a quit; Electron's renderer profile keeps it
// on disk under userData) rather than a database record: this is a UI
// preference, not content, and every window shares the same profile
// already — the `storage` event is what makes a change in one window
// show up in another without a round trip through the backend.
import { useCallback, useEffect, useState } from "react";

export type ViewMode = "canvas" | "list";

export const VIEW_MODES: ViewMode[] = ["canvas", "list"];

export const VIEW_MODE_GLYPH: Record<ViewMode, string> = {
  canvas: "◍",
  list: "≣",
};

const STORAGE_KEY = "index:viewMode";
const DEFAULT_MODE: ViewMode = "canvas";

function isViewMode(value: unknown): value is ViewMode {
  return value === "canvas" || value === "list";
}

function readStored(): ViewMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return isViewMode(stored) ? stored : DEFAULT_MODE;
}

export function useViewMode(): [ViewMode, (next: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(readStored);

  // Another window changed it — follow along, same preference either way.
  useEffect(() => {
    function onStorage(event: StorageEvent): void {
      if (event.key === STORAGE_KEY && isViewMode(event.newValue)) setMode(event.newValue);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const set = useCallback((next: ViewMode) => {
    setMode(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  return [mode, set];
}
