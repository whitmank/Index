// Authored by Karter Whitman using Claude Sonnet 5
// The generic data list: every entry in `item.data` besides the ones
// Focus already draws its own way (name, description, type — see
// `changes.RESERVED_DATA_KEYS`), plus — for a typed item — every field
// its schema declares that the item doesn't have a value for yet. A
// missing one shows as a blank, editable row: the affordance for "this
// probably belongs here" is the empty field itself, sitting right next
// to the ones already filled in. Filling it in is what creates it;
// nothing is written just because the schema mentions it.
//
// Each row's value is editable in place, and a row with a real entry
// behind it is removable. A freeform (null-attribute) tag has no name to
// put in a row's label column, so those are pulled out of the row list
// entirely and drawn together as one row of removable pills instead.
//
// Beneath the rows sits one more control, always present: type a word
// and press Enter to drop it on as a plain tag, or press Tab first to
// turn what you typed into an attribute's name — the field then asks for
// its value the same way a row above it would, and Enter writes both
// together. There is still no kind picker; everything this control
// writes is a plain string.
import { useEffect, useState } from "react";
import type { AttributeKind, DataEntry, DatePrecision, Item, Schema } from "@index/database/types";
import { apply, changes } from "../../changes/index.js";
import { DateValueInput } from "../../components/DateValueInput.tsx";
import { DurationValueInput } from "../../components/DurationValueInput.tsx";
import { ListValueInput } from "../../components/ListValueInput.tsx";
import { SettleInput } from "../../components/SettleInput.tsx";
import { blankFieldValue } from "../../lib/data.js";
import { dateFieldLabel } from "../../lib/dates.js";
import { schemaFor } from "../../lib/derive.js";

const RESERVED = new Set<string>(changes.RESERVED_DATA_KEYS);

interface Row {
  /** The storage key — stable and unique, unlike `attribute`, which two
   * freeform tags share (both blank). */
  key: string;
  attribute: string;
  value: DataEntry["value"];
  kind: AttributeKind;
  /** Only meaningful for a `date`-kind row, and only known when the
   * schema declares it — a field the schema doesn't declare has no
   * precision to look up, so it always shows in full. */
  precision?: DatePrecision;
  prov: DataEntry["prov"];
  /** Whether `item.data` actually has this entry, as opposed to a
   * schema-declared field standing in for one that doesn't exist yet. */
  exists: boolean;
}

export function DataFields({ item }: { item: Item }) {
  const [schemas, setSchemas] = useState<Schema[]>([]);
  useEffect(() => {
    let cancelled = false;
    void window.index.schemas.list().then((answer) => {
      if (!cancelled && "ok" in answer) setSchemas(answer.ok.schemas);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The composer's own draft: `stage` is which half it's asking for.
  // Tab commits nothing by itself — it only promotes what's typed so far
  // from "the tag" to "the attribute's name" and opens a second field for
  // its value.
  const [stage, setStage] = useState<"name" | "value">("name");
  const [draftName, setDraftName] = useState("");
  const [draftValue, setDraftValue] = useState("");

  // Which date row is revealing its full value — hovered or focused —
  // and so has a label reading at full precision too ("Year" → "Date"),
  // for exactly as long as the value beside it does.
  const [revealedDateKey, setRevealedDateKey] = useState<string | null>(null);
  const setDateRevealed = (key: string, revealed: boolean): void => {
    setRevealedDateKey((current) => {
      if (revealed) return key;
      return current === key ? null : current;
    });
  };

  const dataEntries = Object.entries(item.data).filter(([key]) => !RESERVED.has(key));

  // The schema's own first attribute is the item's identity — already
  // drawn as the name field above this list, the same way `data.name`
  // itself is reserved.
  const type = item.data.type?.value as string | undefined;
  const schema = schemaFor(schemas, type ?? null);
  const declared = schema?.attributes.slice(1) ?? [];
  const declaredKeys = new Set(declared.map((attribute) => attribute.attribute.toLowerCase()));

  const rows: Row[] = [
    ...declared.map((attribute): Row => {
      const key = attribute.attribute.toLowerCase();
      const existing = dataEntries.find(([entryKey]) => entryKey === key)?.[1];
      return existing
        ? {
            key,
            attribute: existing.attribute ?? attribute.attribute,
            value: existing.value,
            kind: existing.kind,
            precision: attribute.precision,
            prov: existing.prov,
            exists: true,
          }
        : {
            key,
            attribute: attribute.attribute,
            value: blankFieldValue(attribute.kind),
            kind: attribute.kind,
            precision: attribute.precision,
            prov: "user",
            exists: false,
          };
    }),
    // Named, but not something the schema declares — still a field, just
    // one the schema doesn't know to expect.
    ...dataEntries
      .filter(([key, entry]) => !declaredKeys.has(key) && entry.attribute)
      .map(([key, entry]): Row => ({
        key,
        attribute: entry.attribute ?? "",
        value: entry.value,
        kind: entry.kind,
        prov: entry.prov,
        exists: true,
      })),
  ];

  // Freeform tags — content with no name, so they read as pills rather
  // than as another label/value row. `attribute` is falsy rather than
  // strictly `null` here: SurrealDB drops a `NONE` field on write, so a
  // freeform entry comes back with no `attribute` key at all, not one
  // set to `null` — the same truthiness check `withEntry` already uses
  // to decide this elsewhere.
  const tags = dataEntries
    .filter(([, entry]) => !entry.attribute)
    .map(([key, entry]) => ({ key, value: Array.isArray(entry.value) ? entry.value.join(", ") : entry.value }));

  // Matched by storage key, not by attribute name — two freeform tags
  // share the same (blank) display name, so the name alone can't tell
  // one row's entry apart from another's.
  const otherEntries = (key: string): DataEntry[] =>
    dataEntries.filter(([entryKey]) => entryKey !== key).map(([, entry]) => entry);

  const setValue = (row: Row, value: DataEntry["value"]): void => {
    const written: DataEntry = { attribute: row.attribute, value, kind: row.kind, prov: "user" };
    void apply(changes.setData(item, [...otherEntries(row.key), written]));
  };

  const remove = (key: string): void => {
    void apply(changes.setData(item, otherEntries(key)));
  };

  const resetComposer = (): void => {
    setStage("name");
    setDraftName("");
    setDraftValue("");
  };

  // A bare word becomes a freeform (unnamed) tag — `setAttribute` can't
  // write one of those, since it has nothing to key by, so this goes
  // through `setData` directly, the same as every other freeform tag.
  const commitTag = (): void => {
    const text = draftName.trim();
    if (!text) return;
    const entries = dataEntries.map(([, entry]) => entry);
    void apply(changes.setData(item, [...entries, { attribute: null, value: text, kind: "string", prov: "user" }]));
    resetComposer();
  };

  const commitAttribute = (): void => {
    const attribute = draftName.trim();
    const value = draftValue.trim();
    if (!attribute || !value) {
      resetComposer();
      return;
    }
    void apply(changes.setAttribute(item, attribute, value, "string"));
    resetComposer();
  };

  return (
    <section className="fields-list">
      {rows.map((row) => {
        const dateLabel =
          row.kind === "date"
            ? dateFieldLabel(row.attribute, revealedDateKey === row.key ? undefined : row.precision)
            : null;
        return (
          <div
            className={row.prov === "auto" ? "fields-row is-auto" : "fields-row"}
            key={row.key}
            title={row.prov === "auto" ? "guessed — edit to confirm" : undefined}
          >
            {dateLabel !== null ? (
              <span className="known-fields-name field-label-animated" key={dateLabel}>
                {dateLabel}
              </span>
            ) : (
              <span className="known-fields-name">{row.attribute}</span>
            )}
            <span className="fields-value-input">
              {row.kind === "list" ? (
                <ListValueInput
                  ariaLabel={row.attribute}
                  onCommit={(value) => setValue(row, value)}
                  value={Array.isArray(row.value) ? row.value : []}
                />
              ) : row.kind === "date" ? (
                <DateValueInput
                  ariaLabel={row.attribute}
                  onCommit={(value) => setValue(row, value)}
                  onRevealChange={(revealed) => setDateRevealed(row.key, revealed)}
                  placeholder={row.exists ? undefined : "add…"}
                  precision={row.precision}
                  value={typeof row.value === "string" ? row.value : ""}
                />
              ) : row.kind === "duration" ? (
                <DurationValueInput
                  ariaLabel={row.attribute}
                  onCommit={(value) => setValue(row, value)}
                  placeholder={row.exists ? undefined : "add…"}
                  value={typeof row.value === "string" ? row.value : ""}
                />
              ) : (
                <SettleInput
                  ariaLabel={row.attribute}
                  onCommit={(value) => setValue(row, value)}
                  placeholder={row.exists ? undefined : "add…"}
                  value={typeof row.value === "string" ? row.value : ""}
                />
              )}
            </span>
            {row.exists && (
              <button
                aria-label={`remove ${row.attribute}`}
                className="field-remove"
                onClick={() => remove(row.key)}
                type="button"
              >
                ✕
              </button>
            )}
          </div>
        );
      })}

      {tags.length > 0 && (
        <div className="fields-row">
          <span className="known-fields-name">tags</span>
          <span className="fields-value-input">
            <div className="list-value">
              {tags.map((tag) => (
                <span className="list-value-chip" key={tag.key}>
                  {tag.value}
                  <button aria-label={`remove ${tag.value}`} onClick={() => remove(tag.key)} type="button">
                    ✕
                  </button>
                </span>
              ))}
            </div>
          </span>
        </div>
      )}

      <div className="fields-row is-draft">
        {stage === "value" && (
          <span className="known-fields-name" key="label">
            {draftName}
          </span>
        )}
        <span className="fields-value-input" key="value">
          {stage === "name" ? (
            <input
              aria-label="new tag or field name"
              key="name-input"
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Tab" && draftName.trim()) {
                  event.preventDefault();
                  setStage("value");
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  commitTag();
                } else if (event.key === "Escape") {
                  event.preventDefault();
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
              key="value-input"
              onChange={(event) => setDraftValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitAttribute();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  resetComposer();
                }
              }}
              placeholder="value…"
              value={draftValue}
            />
          )}
        </span>
      </div>
    </section>
  );
}
