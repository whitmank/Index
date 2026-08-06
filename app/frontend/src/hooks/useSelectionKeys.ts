// Authored by Karter Whitman using Claude Opus 5
// The keys that act on what is picked out.
//
// ⌘A takes everything on screen, Escape puts it down, ⌫ takes the picked
// items out of the set you are looking at, and ⌘⌫ deletes them outright.
// The pairing is the one macOS already taught: ⌫ removes something from
// where it is, ⌘⌫ is the one that means gone. Only the second asks.
//
// These two are the only verbs with keys of their own; everything else a
// selection can do is said by name in the command bar. They earn the
// shortcut by being the ones you reach for without thinking, and there
// is no bar of buttons hovering over the work — what is picked is
// already legible in the picked things themselves.
//
// All of them are suppressed while a text input has focus — those keys
// belong to whatever you are typing in — and while an overlay is up,
// because there they already mean something the user asked for first.
import { useEffect } from "react";
import { selection } from "../store/index.js";
import { isEditing } from "./useUndoRedo.ts";

export interface SelectionKeyHandlers {
  /** Off with the set, in one change, no questions — it is one undo away. */
  onRemoveFromSet: () => void;
  /** Gone entirely; the shell asks before this one happens. */
  onAskToDelete: () => void;
}

export function useSelectionKeys(enabled: boolean, handlers: SelectionKeyHandlers): void {
  const { onRemoveFromSet, onAskToDelete } = handlers;

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
        return;
      }

      // `Delete` is the forward-delete key; `Backspace` is the one most
      // keyboards label ⌫ and most people mean. Both, so neither is a
      // trick question.
      if (event.key === "Backspace" || event.key === "Delete") {
        if (selection.count() === 0) return;
        event.preventDefault();
        if (event.metaKey || event.ctrlKey) onAskToDelete();
        else onRemoveFromSet();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onRemoveFromSet, onAskToDelete]);
}
