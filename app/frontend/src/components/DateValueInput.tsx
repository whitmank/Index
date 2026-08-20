// Authored by Karter Whitman using Claude Sonnet 5
// A date field whose stored value is always the full `YYYY-MM-DD`, read
// at rest the way a person would say it — "August 24th, 2016"
// (lib/dates.ts's `formatDateEnglish`) — the same commit-on-settle field
// as any other (SettleInput.tsx) except that focusing it to actually
// edit drops back to the plain ISO string underneath: the one thing
// worth typing, not reading.
import { useEffect, useRef, useState } from "react";
import { formatDateEnglish } from "../lib/dates.js";

export interface DateValueInputProps {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

export function DateValueInput({ value, onCommit, placeholder, ariaLabel }: DateValueInputProps) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const wasFocused = useRef(false);

  useEffect(() => {
    if (!wasFocused.current) setDraft(value);
  }, [value]);

  const commit = (): void => {
    if (draft !== value) onCommit(draft);
  };

  return (
    <input
      aria-label={ariaLabel}
      onBlur={() => {
        wasFocused.current = false;
        setFocused(false);
        commit();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => {
        wasFocused.current = true;
        setFocused(true);
        setDraft(value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          setDraft(value);
          event.currentTarget.blur();
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      placeholder={placeholder}
      type="text"
      value={focused ? draft : formatDateEnglish(value)}
    />
  );
}
