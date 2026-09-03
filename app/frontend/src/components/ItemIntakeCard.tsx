// Authored by Karter Whitman using Claude Sonnet 5
// The one pause every new item gets, resource-backed or manual
// (lib/intake.ts's `captureFromPaths` and `createBlankItemInteractive`).
//
// A resource capture opens the instant a drop/paste happens, showing only
// what's known client-side (the name) — the classifier's guess and the
// extractor's fields (`mode.resolved`) land later and patch this card in
// place. Until they do, the name/type/fields area shows a decorative
// skeleton (aria-hidden — the sr-only status text below is what actually
// announces progress) sized to roughly match what's about to appear, so
// resolving doesn't visibly shove the card around right as Continue
// becomes clickable. A manual item has no evidence at all, so it shows
// the same card with nothing above the description, resolved from the
// start.
//
// Every field the card shows — name, type, each extracted attribute — is
// plain and editable, the same as description/tags always were: nothing
// here is presented as a "guess" needing a qualifier, because editing it
// is right there if it's wrong. What the user actually changes lands with
// prov "user" on the created item (lib/intake.ts's `withCardAnswer`);
// what they leave alone keeps whatever intake gave it.
//
// Unlike the single-input prompt this replaced, dismissing this (Escape,
// or the backdrop) still aborts creation outright — nothing exists yet,
// so there is nothing to undo — but submitting no longer means "one
// answer": every field here is independent, so there is no single Enter
// that means "done". Continue is the one gesture that always means that,
// and it stays disabled until a resource capture has resolved — there is
// nothing yet to submit before then.
import { useEffect, useMemo, useRef, useState } from "react";
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

  // Edits to a resource capture's own fields, layered over `mode.resolved`
  // rather than mirrored into their own seeded state — `mode.resolved`
  // arrives asynchronously after mount, and layering avoids a seeding
  // effect racing that first render. `null` means "untouched"; for type,
  // a wrapper distinguishes "untouched" from "the user explicitly cleared
  // it back to untyped" (both would otherwise be `null`).
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [typeOverride, setTypeOverride] = useState<{ value: string | null } | null>(null);
  const [fieldOverrides, setFieldOverrides] = useState<Record<string, string>>({});

  // The type select's own options — every schema name, plus the current
  // value even if it isn't one (defensive: keeps the native <select> from
  // silently showing no selection at all if a guess and the schema list
  // ever disagree).
  const [schemaNames, setSchemaNames] = useState<string[]>([]);
  useEffect(() => {
    if (mode.kind !== "resource") return;
    let cancelled = false;
    void window.index.schemas.list().then((result) => {
      if (!cancelled && "ok" in result) setSchemaNames(result.ok.schemas.map((schema) => schema.name));
    });
    return () => {
      cancelled = true;
    };
    // Fetched once per card, not re-fetched as `mode` patches in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentType = mode.kind === "resource" ? (typeOverride ? typeOverride.value : (mode.resolved?.type ?? null)) : null;
  const typeOptions = useMemo(() => {
    const names = new Set(schemaNames);
    if (currentType) names.add(currentType);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [schemaNames, currentType]);

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
    const answer: ItemCardAnswer = { description: description.trim(), tags };
    if (mode.kind === "resource" && mode.resolved) {
      if (nameOverride !== null && nameOverride !== mode.name) answer.name = nameOverride;
      if (typeOverride !== null && typeOverride.value !== mode.resolved.type) answer.type = typeOverride.value;
      if (Object.keys(fieldOverrides).length > 0) answer.fieldEdits = fieldOverrides;
    }
    onSubmit(answer);
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
            <input
              aria-label="name"
              className="item-card-name-input"
              onChange={(event) => setNameOverride(event.target.value)}
              value={nameOverride ?? mode.name}
            />
            {mode.resolved === null ? (
              <div aria-hidden="true" className="item-card-skeleton item-card-skeleton-type" />
            ) : (
              <select
                aria-label="type"
                className="item-card-type-select"
                onChange={(event) => setTypeOverride({ value: event.target.value || null })}
                value={currentType ?? ""}
              >
                <option value="">untyped</option>
                {typeOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            )}
            {mode.resolved === null ? (
              <ul aria-hidden="true" className="item-card-fields item-card-skeleton-fields">
                <li className="item-card-skeleton item-card-skeleton-field" />
                <li className="item-card-skeleton item-card-skeleton-field" />
              </ul>
            ) : (
              mode.resolved.fields.length > 0 && (
                <ul className="item-card-fields">
                  {mode.resolved.fields.map((field) => (
                    <li className="item-card-field" key={field.attribute}>
                      <span className="item-card-field-name">{field.attribute}</span>
                      <input
                        aria-label={field.attribute}
                        className="item-card-field-input"
                        onChange={(event) =>
                          setFieldOverrides((current) => ({ ...current, [field.attribute]: event.target.value }))
                        }
                        value={fieldOverrides[field.attribute] ?? displayValue(field.value)}
                      />
                    </li>
                  ))}
                </ul>
              )
            )}
            <span aria-live="polite" className="sr-only">
              {mode.resolved === null
                ? "reading resource…"
                : `type ${mode.resolved.type ?? "untyped"}, ${mode.resolved.fields.length} field${mode.resolved.fields.length === 1 ? "" : "s"} found`}
            </span>
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
          <button
            className="item-card-submit"
            disabled={mode.kind === "resource" && mode.resolved === null}
            onClick={submit}
            title={mode.kind === "resource" && mode.resolved === null ? "still reading this resource…" : undefined}
            type="button"
          >
            continue
          </button>
        </div>
      </div>
    </div>
  );
}
