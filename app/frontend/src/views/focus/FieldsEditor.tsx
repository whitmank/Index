// Authored by Karter Whitman using Claude Opus 4.8
// The fields editor: name/value rows with a kind picker on the value
// cell. Blank rows vanish on commit — an empty name and value is a row
// the user abandoned, not a fact about anything.
import { useState } from "react";
import type { Field, FieldKind, Item } from "@index/database/types";
import { apply, changes } from "../../changes/index.js";
import { SettleInput } from "../../components/SettleInput.tsx";

const KINDS: FieldKind[] = ["string", "number", "date"];

export function FieldsEditor({ item }: { item: Item }) {
  // One blank row is always offered at the end, so adding a field is
  // typing rather than pressing something first.
  const [draftRow, setDraftRow] = useState<Field>({ name: "", value: "", kind: "string" });

  const commit = (fields: Field[]): void => {
    void apply(changes.setFields(item, fields));
  };

  const update = (index: number, patch: Partial<Field>): void => {
    const next = item.fields.map((field, at) => (at === index ? { ...field, ...patch } : field));
    commit(next);
  };

  const addDraft = (patch: Partial<Field>): void => {
    const row = { ...draftRow, ...patch };
    if (row.name.trim() === "" && row.value.trim() === "") {
      setDraftRow(row);
      return;
    }
    setDraftRow({ name: "", value: "", kind: "string" });
    commit([...item.fields, row]);
  };

  return (
    <section className="editor-block">
      <h3>fields</h3>
      <div className="fields">
        {item.fields.map((field, index) => (
          <div className="field-row" key={`${field.name}-${index}`}>
            <SettleInput
              ariaLabel="field name"
              onCommit={(name) => update(index, { name })}
              placeholder="name"
              value={field.name}
            />
            <SettleInput
              ariaLabel="field value"
              onCommit={(value) => update(index, { value })}
              placeholder="value"
              value={field.value}
            />
            <select
              aria-label="value kind"
              onChange={(event) => update(index, { kind: event.target.value as FieldKind })}
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
              onClick={() => commit(item.fields.filter((_, at) => at !== index))}
              type="button"
            >
              ✕
            </button>
          </div>
        ))}

        <div className="field-row is-draft">
          <SettleInput
            ariaLabel="new field name"
            onCommit={(name) => addDraft({ name })}
            placeholder="name"
            value={draftRow.name}
          />
          <SettleInput
            ariaLabel="new field value"
            onCommit={(value) => addDraft({ value })}
            placeholder="value"
            value={draftRow.value}
          />
          <select
            aria-label="new value kind"
            onChange={(event) => setDraftRow({ ...draftRow, kind: event.target.value as FieldKind })}
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
