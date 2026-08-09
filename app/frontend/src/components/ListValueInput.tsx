// Authored by Karter Whitman using Claude Sonnet 5
// A field whose value is several strings, not one — a cast, say, rather
// than a single line naming everyone in it. Chips you can lift back out
// (✕, or ⌫ against an empty draft), plus a bare input that adds one on
// Enter or a comma — the same commit-on-settle spirit as SettleInput,
// just many-valued, so there is no separate "save" step here either.
import { useState } from "react";

export interface ListValueInputProps {
  value: string[];
  onCommit: (next: string[]) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}

export function ListValueInput({
  value,
  onCommit,
  placeholder,
  ariaLabel,
  className,
}: ListValueInputProps) {
  const [draft, setDraft] = useState("");

  const add = (): void => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setDraft("");
    onCommit([...value, trimmed]);
  };

  const removeAt = (index: number): void => {
    onCommit(value.filter((_, at) => at !== index));
  };

  return (
    <div className={className ? `list-value ${className}` : "list-value"}>
      {value.map((entry, index) => (
        <span className="list-value-chip" key={`${entry}-${index}`}>
          {entry}
          <button aria-label={`remove ${entry}`} onClick={() => removeAt(index)} type="button">
            ✕
          </button>
        </span>
      ))}
      <input
        aria-label={ariaLabel}
        className="list-value-input"
        onBlur={add}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            add();
          } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
            removeAt(value.length - 1);
          }
        }}
        placeholder={value.length === 0 ? placeholder : "add…"}
        value={draft}
      />
    </div>
  );
}
