// Authored by Karter Whitman using Claude Opus 5
// A question with two answers, for the few actions worth stopping at.
//
// Almost nothing in this app asks: every change is one undo away, and a
// prompt in front of a reversible thing is a toll, not a safeguard.
// Deletion is the exception — not because it cannot be undone, but
// because it is the one gesture whose target is the thing itself rather
// than something said about it.
//
// The confirming answer is focused on arrival, so ↵ takes it and Escape
// leaves: the prompt costs a keystroke you were already making.
import { useEffect, useRef } from "react";

export interface ConfirmProps {
  question: string;
  /** What the confirming button says — a verb, not "OK". */
  verb: string;
  /** Quieter line under the question: what will happen, or how to undo. */
  note?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function Confirm({ question, verb, note, onConfirm, onCancel }: ConfirmProps) {
  const yes = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    yes.current?.focus();
  }, []);

  // Escape is caught here rather than left to bubble: whatever is
  // underneath — a focus view, a selection — must not also answer it.
  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    } else if (event.key === "Enter") {
      event.preventDefault();
      onConfirm();
    }
  };

  return (
    <div className="confirm-backdrop" onMouseDown={onCancel}>
      <div
        aria-label={question}
        className="confirm"
        onKeyDown={onKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
        role="alertdialog"
      >
        <p className="confirm-question">{question}</p>
        {note && <p className="confirm-note">{note}</p>}

        <div className="confirm-answers">
          <button className="confirm-no" onClick={onCancel} type="button">
            cancel
          </button>
          <button className="confirm-yes" onClick={onConfirm} ref={yes} type="button">
            {verb}
          </button>
        </div>
      </div>
    </div>
  );
}
