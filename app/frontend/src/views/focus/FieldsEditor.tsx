// Authored by Karter Whitman using Claude Opus 4.8
// The fields editor: name/value rows with a kind picker on the value
// cell. Blank rows vanish on commit — an empty name and value is a row
// the user abandoned, not a fact about anything. `list` is the one kind
// whose value is several strings rather than one (lib/fields.ts spells
// out the shape switch; ListValueInput is its chip editor).
import { useState } from "react";
import type { Field, FieldKind, Item } from "@index/database/types";
import { apply, changes } from "../../changes/index.js";
import { ListValueInput } from "../../components/ListValueInput.tsx";
import { SettleInput } from "../../components/SettleInput.tsx";
import { blankFieldValue, coerceFieldValue, isBlankFieldValue } from "../../lib/fields.js";

const KINDS: FieldKind[] = ["string", "number", "date", "list"];

export function FieldsEditor({ item, exclude = [] }: { item: Item; exclude?: string[] }) {
  const [draftRow, setDraftRow] = useState<Field>({ name: "", value: "", kind: "string" });
  // SettleInput only clears its own typed text when its `value` prop
  // changes, and the draft row's value is "" both before and after a
  // commit — remounting on a fresh key is what makes it forget.
  const [draftGeneration, setDraftGeneration] = useState(0);

  const excluded = new Set(exclude.map((name) => name.toLowerCase()));
  const known = item.fields.filter((field) => excluded.has(field.name.toLowerCase()));
  const misc = item.fields.filter((field) => !excluded.has(field.name.toLowerCase()));

  // A layout's own known fields (KnownFields, in the registry) render
  // separately and stay untouched here — this list is everything else,
  // recombined with them before the write, so committing the generic
  // list never drops what the layout already claimed.
  const commit = (fields: Field[]): void => {
    void apply(changes.setFields(item, [...known, ...fields]));
  };

  const update = (index: number, patch: Partial<Field>): void => {
    const next = misc.map((field, at) => (at === index ? { ...field, ...patch } : field));
    commit(next);
  };

  const addDraft = (patch: Partial<Field>): void => {
    const row = { ...draftRow, ...patch };
    if (row.name.trim() === "" && isBlankFieldValue(row.value)) {
      setDraftRow(row);
      return;
    }
    setDraftRow({ name: "", value: "", kind: "string" });
    setDraftGeneration((generation) => generation + 1);
    commit([...misc, row]);
  };

  return (
    <section className="editor-block">
      <h3>fields</h3>
      <div className="fields">
        {misc.map((field, index) => (
          <div className="field-row" key={`${field.name}-${index}`}>
            <SettleInput
              ariaLabel="field name"
              onCommit={(name) => update(index, { name })}
              placeholder="name"
              value={field.name}
            />
            {field.kind === "list" ? (
              <ListValueInput
                ariaLabel="field value"
                onCommit={(value) => update(index, { value })}
                value={Array.isArray(field.value) ? field.value : []}
              />
            ) : (
              <SettleInput
                ariaLabel="field value"
                onCommit={(value) => update(index, { value })}
                placeholder="value"
                value={typeof field.value === "string" ? field.value : ""}
              />
            )}
            <select
              aria-label="value kind"
              onChange={(event) => {
                const kind = event.target.value as FieldKind;
                update(index, { kind, value: coerceFieldValue(field.value, kind) });
              }}
              value={field.kind}
            >
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
            <button
              aria-label={`remove ${field.name}`}
              className="field-remove"
              onClick={() => commit(misc.filter((_, at) => at !== index))}
              type="button"
            >
              ✕
            </button>
          </div>
        ))}

        <div className="field-row is-draft" key={draftGeneration}>
          <SettleInput
            ariaLabel="new field name"
            onCommit={(name) => addDraft({ name })}
            placeholder="name"
            value={draftRow.name}
          />
          {draftRow.kind === "list" ? (
            <ListValueInput
              ariaLabel="new field value"
              onCommit={(value) => addDraft({ value })}
              value={Array.isArray(draftRow.value) ? draftRow.value : []}
            />
          ) : (
            <SettleInput
              ariaLabel="new field value"
              onCommit={(value) => addDraft({ value })}
              placeholder="value"
              value={typeof draftRow.value === "string" ? draftRow.value : ""}
            />
          )}
          <select
            aria-label="new value kind"
            onChange={(event) => {
              const kind = event.target.value as FieldKind;
              setDraftRow({ ...draftRow, kind, value: blankFieldValue(kind) });
            }}
            value={draftRow.kind}
          >
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
          <span />
        </div>
      </div>
    </section>
  );
}
