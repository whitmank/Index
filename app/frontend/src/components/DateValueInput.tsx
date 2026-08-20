// Authored by Karter Whitman using Claude Sonnet 5
// A date field whose stored value is always the full `YYYY-MM-DD`, but
// whose schema may declare a coarser display precision — an album's
// Date reads "2021" at rest, the same commit-on-settle field as any
// other (SettleInput.tsx) except that hovering swaps the truncated
// display for the full date, spelled out the way a person reads it
// ("2021, April 23rd" — lib/dates.ts's `formatDateEnglish`) rather than
// scanned as `YYYY-MM-DD` (DurationValueInput.tsx does the same hover
// swap, for the same reason: the exact value is worth a glance without
// committing to an edit). Focusing to actually edit drops back to the
// plain ISO string — the one thing worth typing, not reading — so what
// you can edit is never less than what's actually stored.
import { useEffect, useRef, useState } from "react";
import type { DatePrecision } from "@index/database/types";
import { formatByPrecision, formatDateEnglish } from "../lib/dates.js";

export interface DateValueInputProps {
  value: string;
  precision?: DatePrecision;
  onCommit: (next: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  /** Fires whenever this field is revealing its full value — hovered or
   * focused — so a label standing beside it (DataFields' "Year" that
   * reads "Date" while this is open) can follow along without owning the
   * input itself. */
  onRevealChange?: (revealed: boolean) => void;
}

export function DateValueInput({
  value,
  precision,
  onCommit,
  placeholder,
  ariaLabel,
  onRevealChange,
}: DateValueInputProps) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const wasFocused = useRef(false);

  useEffect(() => {
    if (!wasFocused.current) setDraft(value);
  }, [value]);

  const commit = (): void => {
    if (draft !== value) onCommit(draft);
  };

  const setRevealed = (nextFocused: boolean, nextHovered: boolean): void => {
    const was = focused || hovered;
    const now = nextFocused || nextHovered;
    if (was !== now) onRevealChange?.(now);
  };

  return (
    <input
      aria-label={ariaLabel}
      onBlur={() => {
        wasFocused.current = false;
        setFocused(false);
        setRevealed(false, hovered);
        commit();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => {
        wasFocused.current = true;
        setFocused(true);
        setDraft(value);
        setRevealed(true, hovered);
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
      onMouseEnter={() => {
        setHovered(true);
        setRevealed(focused, true);
      }}
      onMouseLeave={() => {
        setHovered(false);
        setRevealed(focused, false);
      }}
      placeholder={placeholder}
      type="text"
      value={focused ? draft : hovered ? formatDateEnglish(value) : formatByPrecision(value, precision)}
    />
  );
}
