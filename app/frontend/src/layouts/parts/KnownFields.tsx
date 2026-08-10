// Authored by Karter Whitman using Claude Opus 4.8
// A layout's own field: its name, and the kind its value editor should
// present as — `list` gets chips (ListValueInput), everything else a
// single line (SettleInput).
import type { Field, FieldKind, Item } from "@index/database/types";
import { apply, changes } from "../../changes/index.js";
import { ListValueInput } from "../../components/ListValueInput.tsx";
import { SettleInput } from "../../components/SettleInput.tsx";
import { blankFieldValue } from "../../lib/fields.js";
import type { KnownField } from "../registry.tsx";

function upsertByName(fields: Field[], name: string, value: Field["value"], kind: FieldKind): Field[] {
  const at = fields.findIndex((field) => field.name.toLowerCase() === name.toLowerCase());
  if (at === -1) return [...fields, { name, value, kind }];
  return fields.map((field, index) => (index === at ? { ...field, value, kind } : field));
}

/**
 * A layout's own recognized fields — dedicated, always-present rows
 * (whether or not the item has them yet), matching a schema's or code
 * layout's declared field list. Editing a still-empty row creates the
 * real field on first commit (upsert by name); editing an existing one
 * updates it in place. Unlike the generic FieldsEditor, names here
 * aren't user-editable and there's no add/remove — the layout itself is
 * what decides which rows exist.
 */
export function KnownFields({ item, fields }: { item: Item; fields: KnownField[] }) {
  if (fields.length === 0) return null;
  return (
    <ul className="fields-list fields-list-unlabeled">
      {fields.map(({ name, kind }) => {
        const field = item.fields.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase());
        const value = field?.value ?? blankFieldValue(kind);
        const commit = (next: Field["value"]) =>
          void apply(changes.setFields(item, upsertByName(item.fields, name, next, kind)));
        return (
          <li className="fields-row" key={name}>
            <span className="known-fields-name">{name}</span>
            {kind === "list" ? (
              <ListValueInput
                ariaLabel={name}
                className="fields-value-input"
                onCommit={commit}
                value={Array.isArray(value) ? value : []}
              />
            ) : (
              <SettleInput
                ariaLabel={name}
                className="fields-value-input"
                onCommit={commit}
                placeholder="value"
                value={typeof value === "string" ? value : ""}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
