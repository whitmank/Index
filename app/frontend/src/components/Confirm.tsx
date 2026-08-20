// Authored by Karter Whitman using Claude Opus 5
// A question with two answers, for the few actions worth stopping at.
//
// Almost nothing in this app asks: every change is one undo away, and a
// prompt in front of a reversible thing is a toll, not a safeguard.
// Deletion is the exception — not because it cannot be undone, but
// because it is the one gesture whose target is the thing itself rather
// than something said about it.
//
// Its keyboard (←/→ to rove focus, ↵/⌘↵ fixed to the two ways of saying
// yes) lives in useAnswerKeys — shared with FocusToolbar's own inline
// delete strip, the other place this exact question shows up.
import { useEffect, useRef } from "react";
import { useAnswerKeys } from "../hooks/useAnswerKeys.ts";

export interface ConfirmProps {
  question: string;
  /** What the confirming button says — a verb, not "OK". */
  verb: string;
  /** Quieter line under the question: what will happen, or how to undo. */
  note?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** A second way of saying yes, alongside `verb` rather than instead of
   * it — for the one question that isn't really yes/no (delete just
   * this, or with what it carries too?). Omit for the ordinary case;
   * present, it sits between cancel and the primary answer, and never
   * takes the Enter binding `verb` keeps. */
  altVerb?: string;
  onAlt?: () => void;
}

export function Confirm({ question, verb, note, onConfirm, onCancel, altVerb, onAlt }: ConfirmProps) {
  const cancel = useRef<HTMLButtonElement>(null);
  const alt = useRef<HTMLButtonElement>(null);
  const yes = useRef<HTMLButtonElement>(null);

  const hasAlt = Boolean(altVerb && onAlt);
  // Left to right, matching both the DOM order below and how the row
  // reads on screen — an arrow key moves the ring the direction it
  // points, not by some other order this list would otherwise hide.
  const order = [
    { ref: cancel, onChoose: onCancel },
    ...(hasAlt ? [{ ref: alt, onChoose: onAlt as () => void }] : []),
    { ref: yes, onChoose: onConfirm },
  ];

  useEffect(() => {
    yes.current?.focus();
  }, []);

  // Escape bubbling out from here would also reach whatever is
  // underneath — a focus view, a selection — so useAnswerKeys stops it
  // rather than letting it answer twice.
  const onKeyDown = useAnswerKeys(order, { onAlt, onCancel });

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
          <button className="confirm-no" onClick={onCancel} ref={cancel} type="button">
            cancel
          </button>
          {hasAlt && (
            <button className="confirm-alt" onClick={onAlt} ref={alt} type="button">
              {altVerb}
            </button>
          )}
          <button className="confirm-yes" onClick={onConfirm} ref={yes} type="button">
            {verb}
          </button>
        </div>
      </div>
    </div>
  );
}
