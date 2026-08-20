// Authored by Karter Whitman using Claude Sonnet 5
// Keyboard for a row of "answer" buttons — shared by Confirm.tsx's modal
// and FocusToolbar's own inline delete strip, so the same two dialogs
// don't quietly grow different keyboards for the same shape of question.
//
// ←/→ rove a focus ring across whichever buttons are actually present.
// ↵ activates whichever one the ring is actually on — the ordinary
// "Enter clicks the focused button" a person expects once they've
// arrowed somewhere, not a fixed answer that ignores where they just
// moved to. Escape always cancels, wherever focus is.
//
// ⌫/Delete and ⌘⌫/⌘Delete are the other pair, and deliberately fixed
// rather than focus-following like ↵ — the same gesture that opened this
// dialog (useSelectionKeys.ts's ⌘⌫) still means the same two things once
// it's up, without first having to arrow anywhere: plain ⌫ is the
// primary answer, ⌘⌫ is the alt one.
import type { KeyboardEvent, RefObject } from "react";

export interface AnswerButton {
  ref: RefObject<HTMLButtonElement | null>;
  onChoose: () => void;
}

export function useAnswerKeys(
  order: AnswerButton[],
  { onCancel, onAlt }: { onCancel: () => void; onAlt?: () => void },
): (event: KeyboardEvent) => void {
  return (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.metaKey || event.ctrlKey) {
        onAlt?.();
        return;
      }
      // Whichever button the ring is on; the last one (the primary
      // answer) if focus somehow isn't on any of them — the same
      // default the dialog opens focused on.
      const focused = order.find((button) => button.ref.current === document.activeElement);
      (focused ?? order[order.length - 1])?.onChoose();
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      if (event.metaKey || event.ctrlKey) {
        onAlt?.();
      } else {
        order[order.length - 1]?.onChoose();
      }
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const at = order.findIndex((button) => button.ref.current === document.activeElement);
      const step = event.key === "ArrowRight" ? 1 : -1;
      const next = at === -1 ? 0 : Math.min(Math.max(at + step, 0), order.length - 1);
      order[next]?.ref.current?.focus();
    }
  };
}
