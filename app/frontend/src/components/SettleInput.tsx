// Authored by Karter Whitman using Claude Opus 4.8
// Commit on settle (DESIGN-CONCEPT §6): a field keeps its own draft while
// you type and writes exactly once, when you leave it or press Enter —
// never per keystroke. An unchanged value writes nothing at all, so
// tabbing through a form doesn't fill the history with changes that say
// nothing. Escape abandons the draft.
//
// The draft is the only state outside the store, which is the whole rule.
import { useEffect, useRef, useState } from "react";

export interface SettleInputProps {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  multiline?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function SettleInput({
  value,
  onCommit,
  placeholder,
  autoFocus,
  multiline,
  className,
  ariaLabel,
}: SettleInputProps) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);

  // Adopt changes from elsewhere — an undo, another view — but never
  // while the user is mid-edit in this very field.
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  const commit = (): void => {
    if (draft === value) return;
    onCommit(draft);
  };

  const shared = {
    "aria-label": ariaLabel,
    className,
    placeholder,
    value: draft,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft(event.target.value),
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      commit();
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setDraft(value);
        event.currentTarget.blur();
        return;
      }
      if (event.key === "Enter" && !(multiline && !event.metaKey)) {
        event.preventDefault();
        event.currentTarget.blur();
      }
    },
  };

  return multiline ? (
    <textarea {...shared} autoFocus={autoFocus} rows={3} />
  ) : (
    <input {...shared} autoFocus={autoFocus} type="text" />
  );
}
