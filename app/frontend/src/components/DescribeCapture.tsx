// Authored by Karter Whitman using Claude Sonnet 5
// The one question a fresh capture is stopped for: "What is this?" — a
// single unstructured line, attached to the item before it is ever minted
// (lib/intake.ts's `captureFromPaths`). Shown against the resource being
// captured, since that's what the user is looking at, but the answer
// belongs to the item as a whole.
//
// Unlike Confirm, this is not a yes/no toll on a reversible action: it is
// the deliberately mandatory first word on a new item, which is why
// dismissing it (Escape, or the backdrop) aborts the capture rather than
// merely skipping the description — nothing has been created yet, so
// there is nothing to undo. Submitting with an empty line is different
// from dismissing: the user answered "nothing to say" on purpose, and the
// item is still made.
import { useEffect, useRef, useState } from "react";
import type { Resource } from "@index/database/types";

export interface DescribeCaptureProps {
  resource: Resource;
  onSubmit: (description: string) => void;
  onCancel: () => void;
}

export function DescribeCapture({ resource, onSubmit, onCancel }: DescribeCaptureProps) {
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    } else if (event.key === "Enter") {
      event.preventDefault();
      onSubmit(text.trim());
    }
  };

  return (
    <div className="describe-capture-backdrop" onMouseDown={onCancel}>
      <div
        aria-label="What is this?"
        className="describe-capture"
        onKeyDown={onKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
        role="alertdialog"
      >
        <p className="describe-capture-question">What is this?</p>
        <p className="describe-capture-note">{resource.name}</p>

        <input
          aria-label="What is this?"
          className="describe-capture-input"
          onChange={(event) => setText(event.target.value)}
          placeholder="a receipt from the hardware store…"
          ref={input}
          type="text"
          value={text}
        />

        <div className="describe-capture-answers">
          <button className="describe-capture-cancel" onClick={onCancel} type="button">
            cancel
          </button>
          <button
            className="describe-capture-submit"
            onClick={() => onSubmit(text.trim())}
            type="button"
          >
            continue
          </button>
        </div>
      </div>
    </div>
  );
}
