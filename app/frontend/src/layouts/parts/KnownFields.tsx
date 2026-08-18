// Authored by Karter Whitman using Claude Opus 4.8
// A layout's own field: its attribute name, and the kind its value
// editor should present as — `list` gets chips (ListValueInput),
// everything else a single line (SettleInput).
import type { AttributeKind, Item, MetadataEntry } from "@index/database/types";
import { apply, changes } from "../../changes/index.js";
import { ListValueInput } from "../../components/ListValueInput.tsx";
import { SettleInput } from "../../components/SettleInput.tsx";
import { blankFieldValue } from "../../lib/metadata.js";
import type { KnownField } from "../registry.tsx";

function upsertByName(
  metadata: MetadataEntry[],
  attribute: string,
  value: MetadataEntry["value"],
  kind: AttributeKind,
): MetadataEntry[] {
  const at = metadata.findIndex(
    (entry) => entry.attribute !== null && entry.attribute.toLowerCase() === attribute.toLowerCase(),
  );
  if (at === -1) return [...metadata, { attribute, value, kind, prov: "user" }];
  return metadata.map((entry, index) => (index === at ? { ...entry, value, kind, prov: "user" } : entry));
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
      {fields.map(({ attribute, kind }) => {
        const entry = item.metadata.find(
          (candidate) => candidate.attribute?.toLowerCase() === attribute.toLowerCase(),
        );
        const value = entry?.value ?? blankFieldValue(kind);
        const commit = (next: MetadataEntry["value"]) =>
          void apply(changes.setMetadata(item, upsertByName(item.metadata, attribute, next, kind)));
        return (
          <li className="fields-row" key={attribute}>
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
