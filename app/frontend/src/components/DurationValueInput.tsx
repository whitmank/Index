// Authored by Karter Whitman using Claude Sonnet 5
// A duration field whose stored value is always the full integer-second
// count, but reads at rest the way you'd actually say it — "59 min", not
// "58:32". Hovering it, the same as focusing it to edit, swaps that
// rounded reading for the exact one underneath (DateValueInput.tsx's
// commit-on-settle field does the same swap on focus alone; a duration
// adds hover because the exact value here is worth a glance without
// committing to an edit).
import { useEffect, useRef, useState } from "react";
import { formatDurationPrecise, formatDurationRounded, parseDurationInput } from "../lib/duration.js";

export interface DurationValueInputProps {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

export function DurationValueInput({ value, onCommit, placeholder, ariaLabel }: DurationValueInputProps) {
  const [draft, setDraft] = useState(formatDurationPrecise(value));
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const wasFocused = useRef(false);

  useEffect(() => {
    if (!wasFocused.current) setDraft(formatDurationPrecise(value));
  }, [value]);

  const commit = (): void => {
    const seconds = parseDurationInput(draft);
    if (seconds === null) return;
    const next = String(seconds);
    if (next !== value) onCommit(next);
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
        setDraft(formatDurationPrecise(value));
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          setDraft(formatDurationPrecise(value));
          event.currentTarget.blur();
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      placeholder={placeholder}
      type="text"
      value={focused ? draft : hovered ? formatDurationPrecise(value) : formatDurationRounded(value)}
    />
  );
}
