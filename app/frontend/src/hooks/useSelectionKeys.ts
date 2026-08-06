// Authored by Karter Whitman using Claude Opus 5
// ⌘A takes everything on screen; Escape puts it down again.
//
// Both are suppressed while a text input has focus — select-all belongs
// to whatever you are typing in — and while an overlay is up, because
// there ⌘A and Escape already mean something the user asked for first.
import { useEffect } from "react";
import { selection } from "../store/index.js";
import { isEditing } from "./useUndoRedo.ts";

export function useSelectionKeys(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(event: KeyboardEvent): void {
      if (isEditing(event.target)) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
        // Nothing on screen to take: leave ⌘A to the browser rather than
        // swallowing it to do nothing.
        if (!selection.hasScope()) return;
        event.preventDefault();
        selection.selectAll();
        return;
      }

      if (event.key === "Escape" && selection.count() > 0) {
        event.preventDefault();
        selection.clear();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
