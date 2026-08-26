// Authored by Karter Whitman using Claude Sonnet 5
// The one pause every new item gets, resource-backed or manual
// (lib/intake.ts's `captureFromPaths` and `createBlankItemInteractive`).
//
// A resource capture arrives with everything the classifier and composer
// already found — type guess, extracted fields — resolved before this
// ever renders, so the preview below shows it immediately rather than
// waiting on anything typed here. A manual item has no evidence at all,
// so it shows the same card with nothing above the description.
//
// Unlike the single-input prompt this replaced, dismissing this (Escape,
// or the backdrop) still aborts creation outright — nothing exists yet,
// so there is nothing to undo — but submitting no longer means "one
// answer": description and tags are independent, so there is no single
// Enter that means "done". Continue is the one gesture that always means
// that.
import { useEffect, useRef, useState } from "react";
import type { ItemCardAnswer, ItemCardMode, TagEntry } from "../lib/intake.js";

export interface ItemIntakeCardProps {
  mode: ItemCardMode;
  onSubmit: (answer: ItemCardAnswer) => void;
  onCancel: () => void;
}

function displayValue(value: string | string[]): string {
  return Array.isArray(value) ? value.join(", ") : value;
}

export function ItemIntakeCard({ mode, onSubmit, onCancel }: ItemIntakeCardProps) {
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<TagEntry[]>([]);
  const descriptionInput = useRef<HTMLInputElement>(null);

  // The tag composer's own draft, the same shape `DataFields.tsx` uses
  // for an existing item: `stage` is which half it's asking for. Tab
  // commits nothing by itself — it only promotes what's typed so far
  // from "the tag" to "the attribute's name" and opens a second field
  // for its value, so "artist" + tab + "Karter Whitman" + enter lands
  // as one typed tag rather than two freeform ones.
  const [stage, setStage] = useState<"name" | "value">("name");
  const [draftName, setDraftName] = useState("");
  const [draftValue, setDraftValue] = useState("");

  useEffect(() => {
    descriptionInput.current?.focus();
  }, []);

  const resetComposer = (): void => {
    setStage("name");
    setDraftName("");
    setDraftValue("");
  };

  const commitTag = (): void => {
    const text = draftName.trim();
    if (!text) return;
    setTags((current) => [...current, { attribute: null, value: text }]);
    resetComposer();
  };

  const commitAttribute = (): void => {
    const attribute = draftName.trim();
    const value = draftValue.trim();
    if (!attribute || !value) {
      resetComposer();
      return;
    }
    setTags((current) => [...current, { attribute, value }]);
    resetComposer();
  };

  const removeTag = (index: number): void => {
    setTags((current) => current.filter((_, at) => at !== index));
  };

  const submit = (): void => {
    onSubmit({ description: description.trim(), tags });
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };

  return (
    <div className="item-card-backdrop" onMouseDown={onCancel}>
      <div
        aria-label={mode.kind === "resource" ? mode.name : "New item"}
        className="item-card"
        onKeyDown={onKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
        role="alertdialog"
      >
        {mode.kind === "resource" ? (
          <>
            <p className="item-card-name">{mode.name}</p>
            <p className="item-card-type">{mode.type ? `guessed: ${mode.type}` : "untyped"}</p>
            {mode.fields.length > 0 && (
              <ul className="item-card-fields">
                {mode.fields.map((field) => (
                  <li className="item-card-field" key={field.attribute}>
                    <span className="item-card-field-name">{field.attribute}</span>
                    <span className="item-card-field-value">{displayValue(field.value)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="item-card-name">New item</p>
        )}

        <input
          aria-label="description"
          className="item-card-description"
          onChange={(event) => setDescription(event.target.value)}
          placeholder="a receipt from the hardware store…"
          ref={descriptionInput}
          type="text"
          value={description}
        />

        <div className="item-card-tags-label">tags</div>
        <div className="item-card-tags">
          {tags.map((tag, index) => {
            const label = tag.attribute ? `${tag.attribute}: ${tag.value}` : tag.value;
            return (
              <span className="item-card-tag-chip" key={index}>
                {label}
                <button aria-label={`remove ${label}`} onClick={() => removeTag(index)} type="button">
                  ✕
                </button>
              </span>
            );
          })}
          {stage === "value" && <span className="item-card-tag-draft-name">{draftName}</span>}
          {stage === "name" ? (
            <input
              aria-label="new tag or field name"
              className="item-card-tag-input"
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Tab" && draftName.trim()) {
                  event.preventDefault();
                  setStage("value");
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  commitTag();
                } else if (event.key === "Escape" && draftName.trim()) {
                  // A draft in progress is what Escape clears here —
                  // only an idle, empty composer lets it bubble up to
                  // the card's own Escape, which cancels the whole thing.
                  event.preventDefault();
                  event.stopPropagation();
                  resetComposer();
                }
              }}
              placeholder="tag, or a field name — tab for its value…"
              value={draftName}
            />
          ) : (
            <input
              aria-label={`value for ${draftName}`}
              autoFocus
              className="item-card-tag-input"
              onChange={(event) => setDraftValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitAttribute();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  resetComposer();
                }
              }}
              placeholder="value…"
              value={draftValue}
            />
          )}
        </div>

        <div className="item-card-answers">
          <button className="item-card-cancel" onClick={onCancel} type="button">
            cancel
          </button>
          <button className="item-card-submit" onClick={submit} type="button">
            continue
          </button>
        </div>
      </div>
    </div>
  );
}
