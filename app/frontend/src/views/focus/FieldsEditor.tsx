// Authored by Karter Whitman using Claude Opus 4.8
// The fields editor: name/value rows with a kind picker on the value
// cell. Blank rows vanish on commit — an empty name and value is a row
// the user abandoned, not a fact about anything. `list` is the one kind
// whose value is several strings rather than one (lib/data.ts spells
// out the shape switch; ListValueInput is its chip editor).
//
// Everything written here carries `prov: "user"` — this editor is
// name-driven and never produces a freeform (null-attribute) tag; the
// data model supports one, but nothing in this UI does yet.
import { useState } from "react";
import type { AttributeKind, DataEntry, Item } from "@index/database/types";
import { apply, changes } from "../../changes/index.js";
import { ListValueInput } from "../../components/ListValueInput.tsx";
import { SettleInput } from "../../components/SettleInput.tsx";
import { blankFieldValue, coerceFieldValue, isBlankFieldValue } from "../../lib/data.js";

const KINDS: AttributeKind[] = ["string", "number", "date", "list"];
const RESERVED = new Set<string>(changes.RESERVED_DATA_KEYS);

export function FieldsEditor({ item, exclude = [] }: { item: Item; exclude?: string[] }) {
  const [draftRow, setDraftRow] = useState<DataEntry>({
    attribute: "",
    value: "",
    kind: "string",
    prov: "user",
  });
  // SettleInput only clears its own typed text when its `value` prop
  // changes, and the draft row's value is "" both before and after a
  // commit — remounting on a fresh key is what makes it forget.
  const [draftGeneration, setDraftGeneration] = useState(0);

  const excluded = new Set(exclude.map((name) => name.toLowerCase()));
  // `data`'s reserved keys (name, description, ...) never show up here —
  // `setData` preserves them on its own. What's left splits the same way
  // it always has: a layout's own claimed attributes, and everything else.
  const entries = Object.entries(item.data).filter(([key]) => !RESERVED.has(key));
  const known = entries
    .filter(([, entry]) => entry.attribute && excluded.has(entry.attribute.toLowerCase()))
    .map(([, entry]) => entry);
  const misc = entries
    .filter(([, entry]) => !entry.attribute || !excluded.has(entry.attribute.toLowerCase()))
    .map(([, entry]) => entry);

  // A layout's own known fields (KnownFields, in the registry) render
  // separately and stay untouched here — this list is everything else,
  // recombined with them before the write, so committing the generic
  // list never drops what the layout already claimed.
  const commit = (rows: DataEntry[]): void => {
    void apply(changes.setData(item, [...known, ...rows]));
  };

  const update = (index: number, patch: Partial<DataEntry>): void => {
    const next = misc.map((entry, at) => (at === index ? { ...entry, ...patch, prov: "user" as const } : entry));
    commit(next);
  };

  const addDraft = (patch: Partial<DataEntry>): void => {
    const row = { ...draftRow, ...patch };
    if ((row.attribute ?? "").trim() === "" && isBlankFieldValue(row.value)) {
      setDraftRow(row);
      return;
    }
    setDraftRow({ attribute: "", value: "", kind: "string", prov: "user" });
    setDraftGeneration((generation) => generation + 1);
    commit([...misc, { ...row, prov: "user" }]);
  };

  return (
    <section className="editor-block">
      <h3>fields</h3>
      <div className="fields">
        {misc.map((entry, index) => (
          <div
            className={entry.prov === "auto" ? "field-row is-auto" : "field-row"}
            key={`${entry.attribute}-${index}`}
            title={entry.prov === "auto" ? "guessed — edit to confirm" : undefined}
          >
            <SettleInput
              ariaLabel="field name"
              onCommit={(attribute) => update(index, { attribute })}
              placeholder="name"
              value={entry.attribute ?? ""}
            />
            {entry.kind === "list" ? (
              <ListValueInput
                ariaLabel="field value"
                onCommit={(value) => update(index, { value })}
                value={Array.isArray(entry.value) ? entry.value : []}
              />
            ) : (
              <SettleInput
                ariaLabel="field value"
                onCommit={(value) => update(index, { value })}
                placeholder="value"
                value={typeof entry.value === "string" ? entry.value : ""}
              />
            )}
            <select
              aria-label="value kind"
              onChange={(event) => {
                const kind = event.target.value as AttributeKind;
                update(index, { kind, value: coerceFieldValue(entry.value, kind) });
              }}
              value={entry.kind}
            >
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
            <button
              aria-label={`remove ${entry.attribute}`}
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
            onCommit={(attribute) => addDraft({ attribute })}
            placeholder="name"
            value={draftRow.attribute ?? ""}
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
              const kind = event.target.value as AttributeKind;
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
