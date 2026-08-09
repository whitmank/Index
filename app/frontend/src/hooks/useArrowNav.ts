// Authored by Karter Whitman using Claude Sonnet 5
// ← / → walk the trail without reaching for the mouse — back to the
// crumb behind you, forward into whatever is picked out. A / D are the
// same two gestures under the hand's other convention, so the trail
// answers to either. Bare keys, so they stand down the moment a
// modifier, a text field, or an overlay is in the way: the same guard
// useSelectionKeys already keeps for ⌫.
import { useEffect } from "react";
import { isEditing } from "./useUndoRedo.ts";

export interface ArrowNavHandlers {
  /** ← / A — back one step on the trail. */
  onBack: () => void;
  /** → / D — into whatever is picked out. */
  onForward: () => void;
}

export function useArrowNav(enabled: boolean, handlers: ArrowNavHandlers): void {
  const { onBack, onForward } = handlers;

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(event: KeyboardEvent): void {
      if (isEditing(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const key = event.key.toLowerCase();
      if (event.key === "ArrowLeft" || key === "a") {
        event.preventDefault();
        onBack();
      } else if (event.key === "ArrowRight" || key === "d") {
        event.preventDefault();
        onForward();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onBack, onForward]);
}
