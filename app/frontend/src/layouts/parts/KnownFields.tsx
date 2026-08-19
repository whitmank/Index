// Authored by Karter Whitman using Claude Opus 4.8
// A layout's own field: its attribute name, and the kind its value
// editor should present as — `list` gets chips (ListValueInput),
// everything else a single line (SettleInput).
import type { DataEntry, Item } from "@index/database/types";
import { apply, changes } from "../../changes/index.js";
import { ListValueInput } from "../../components/ListValueInput.tsx";
import { SettleInput } from "../../components/SettleInput.tsx";
import { blankFieldValue } from "../../lib/data.js";
import type { KnownField } from "../registry.tsx";

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
      {fields.map(({ attribute, kind }) => {
        const entry = item.data[attribute.toLowerCase()];
        const value = entry?.value ?? blankFieldValue(kind);
        const isAuto = entry?.prov === "auto";
        const commit = (next: DataEntry["value"]) => void apply(changes.setAttribute(item, attribute, next, kind));
        return (
          <li
            className={isAuto ? "fields-row is-auto" : "fields-row"}
            key={attribute}
            title={isAuto ? "guessed — edit to confirm" : undefined}
          >
            <span className="known-fields-name">{attribute}</span>
            {kind === "list" ? (
              <ListValueInput
                ariaLabel={attribute}
                className="fields-value-input"
                onCommit={commit}
                value={Array.isArray(value) ? value : []}
              />
            ) : (
              <SettleInput
                ariaLabel={attribute}
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
