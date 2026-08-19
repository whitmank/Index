// Authored by Karter Whitman using Claude Sonnet 5
// The schema manager: create a type, name its attributes. A schema is
// data, not code (database/types.ts) — this is the one place that data
// gets written, the same relationship FieldsEditor has to an item's own
// data. Schemas sit outside the Change model, like labels: there is
// nothing about a type's shape to undo, only its current shape.
//
// `SchemaEditor` is the list-and-editor itself; `SchemaManager` is that
// plus a standalone modal's backdrop and header — Settings' Types tab
// wants the first without the second.
import { useEffect, useRef, useState } from "react";
import type { AttributeKind, Schema, SchemaAttribute } from "@index/database/types";
import { SettleInput } from "../../components/SettleInput.tsx";

const KINDS: AttributeKind[] = ["string", "number", "date", "list"];

/** The password-reveal pair, in the app's own outline-glyph idiom
 * (DeviceIcon): plain currentColor strokes, so hover and quiet states
 * reach these the way they reach text.
 *
 * The closed state keeps the whole eye and lays a slash over it, rather
 * than the usual `eye-off` that breaks the outline into fragments — at
 * this size those fragments read as a smudge, and the two states have to
 * be told apart at a glance. Sharing every path means the slash is the
 * only difference, which is the difference being communicated.
 */
function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="eye-icon"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      {!open && <line x1="20" x2="4" y1="4" y2="20" />}
    </svg>
  );
}

export interface SchemaManagerProps {
  onClose: () => void;
}

type Draft = Pick<Schema, "name" | "attributes">;

/**
 * The list-and-editor body on its own, without a surface of its own to
 * sit in — the standalone modal below wraps it in one, and Settings'
 * Types tab wraps it in another (PRODUCT-SPEC-style reuse: one place
 * this data gets read and written, shown wherever it's asked for).
 */
export function SchemaEditor() {
  const [schemas, setSchemas] = useState<Schema[] | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    void window.index.schemas.list().then((answer) => {
      if ("ok" in answer) setSchemas(answer.ok.schemas);
    });
  }, []);

  const selected = schemas?.find((schema) => schema.name === selectedName) ?? null;

  const save = (next: Draft): void => {
    void window.index.schemas.upsert(next).then((answer) => {
      if (!("ok" in answer)) return;
      const saved = answer.ok;
      setSchemas((all) => {
        const rest = (all ?? []).filter((schema) => schema.name !== saved.name);
        return [...rest, saved].sort((a, b) => a.name.localeCompare(b.name));
      });
      setSelectedName(saved.name);
    });
  };

  const createType = (): void => {
    const name = newName.trim();
    if (!name) return;
    setNewName("");
    save({ name, attributes: [] });
  };

  return (
    <div className="schema-manager-body">
      <nav className="schema-manager-list">
        {schemas === null && <p className="renderer-quiet">loading…</p>}
        {schemas?.length === 0 && <p className="renderer-quiet">No types yet.</p>}
        {schemas?.map((schema) => (
          <button
            className={
              schema.name === selectedName ? "schema-manager-item is-current" : "schema-manager-item"
            }
            key={schema.id}
            onClick={() => setSelectedName(schema.name)}
            type="button"
          >
            {schema.name}
          </button>
        ))}

        <div className="schema-manager-new">
          <input
            aria-label="new type name"
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") createType();
            }}
            placeholder="new type…"
            value={newName}
          />
          <button disabled={!newName.trim()} onClick={createType} type="button">
            add
          </button>
        </div>
      </nav>

      <div className="schema-manager-editor">
        {!selected && <p className="renderer-quiet">Pick a type, or add one.</p>}
        {selected && <AttributesList key={selected.id} onSave={save} schema={selected} />}
      </div>
    </div>
  );
}

export function SchemaManager({ onClose }: SchemaManagerProps) {
  // Caught here, not left to bubble: Focus (if it is open behind this)
  // must not also close.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  return (
    <div className="confirm-backdrop" onMouseDown={onClose}>
      <div
        aria-label="Types"
        className="schema-manager"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="schema-manager-bar">
          <h2>types</h2>
          <button aria-label="close" className="focus-close" onClick={onClose} type="button">
            ✕
          </button>
        </header>

        <SchemaEditor />
      </div>
    </div>
  );
}

/** The selected type's attribute list — one row per attribute, plus a
 * standing draft row, exactly FieldsEditor's shape one level up (defining
 * attributes instead of filling them in). */
function AttributesList({ schema, onSave }: { schema: Schema; onSave: (next: Draft) => void }) {
  const [draftRow, setDraftRow] = useState<SchemaAttribute>({ attribute: "", kind: "string", display: true });
  // SettleInput only clears its own typed text when its `value` prop
  // changes — and the draft row's value is "" both before typing and
  // after commit, so committing never actually changes it. Remounting
  // the row on a fresh key is what makes it forget what was typed.
  const [draftGeneration, setDraftGeneration] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const fieldsRef = useRef<HTMLDivElement>(null);

  const commitAttributes = (attributes: SchemaAttribute[]): void => {
    onSave({ name: schema.name, attributes: attributes.filter((a) => a.attribute.trim() !== "") });
  };

  const updateAttribute = (index: number, patch: Partial<SchemaAttribute>): void => {
    const next = schema.attributes.map((attribute, at) => (at === index ? { ...attribute, ...patch } : attribute));
    commitAttributes(next);
  };

  const addDraft = (patch: Partial<SchemaAttribute>): void => {
    const row = { ...draftRow, ...patch };
    if (row.attribute.trim() === "") {
      setDraftRow(row);
      return;
    }
    setDraftRow({ attribute: "", kind: "string", display: true });
    setDraftGeneration((generation) => generation + 1);
    commitAttributes([...schema.attributes, row]);
  };

  /** Which real attribute the pointer is over — the standing draft row at
   * the end is never itself a drop target. */
  const indexAt = (clientY: number): number => {
    const rows = [
      ...(fieldsRef.current?.querySelectorAll<HTMLElement>(".schema-field-row:not(.is-draft)") ?? []),
    ];
    for (const [index, row] of rows.entries()) {
      const box = row.getBoundingClientRect();
      if (clientY < box.top + box.height / 2) return index;
    }
    return rows.length;
  };

  /** An attribute's order is the array's order — there is no arrow to
   * move, so this writes the whole reordered list back in one save, the
   * same as any other attribute edit. */
  const startReorder = (event: React.PointerEvent, from: number): void => {
    event.preventDefault();
    setDragging(from);

    const onMove = (move: PointerEvent): void => move.preventDefault();
    const onUp = (up: PointerEvent): void => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDragging(null);

      const target = indexAt(up.clientY);
      const to = target > from ? target - 1 : target;
      if (to === from) return;
      const next = [...schema.attributes];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved as SchemaAttribute);
      commitAttributes(next);
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
  };

  return (
    <section className="schema-editor-block">
      <h3>{schema.name}</h3>

      <div className="schema-fields" ref={fieldsRef}>
        {schema.attributes.map((attribute, index) => (
          <div
            className={dragging === index ? "schema-field-row is-dragging" : "schema-field-row"}
            key={`${attribute.attribute}-${index}`}
          >
            <button
              aria-label="reorder"
              className="schema-field-handle"
              onPointerDown={(event) => startReorder(event, index)}
              type="button"
            >
              ⠿
            </button>

            {/* One fixed-width column, two jobs — whichever this row has.
                The leading attribute is the item's name, so whether it
                shows among the attributes is not a question it has;
                every other row answers it with the eye. Sharing the
                column keeps each row's input starting at the same x, as
                the resources list does with its primary star. */}
            {index === 0 ? (
              <span
                className="schema-field-primary-indicator"
                title="names the item — drag another field above to change it"
              >
                ★<span className="sr-only">Names the item</span>
              </span>
            ) : (
              <button
                aria-label={
                  attribute.display
                    ? `hide ${attribute.attribute} from the top of the item`
                    : `show ${attribute.attribute} on the item`
                }
                aria-pressed={attribute.display}
                className="field-visibility"
                onClick={() => updateAttribute(index, { display: !attribute.display })}
                title={
                  attribute.display
                    ? "shown at the top of the item — click to keep it further down instead"
                    : "hidden from the top of the item — still kept, and still editable in its fields list"
                }
                type="button"
              >
                <EyeIcon open={attribute.display} />
              </button>
            )}
            <SettleInput
              ariaLabel="field name"
              onCommit={(attributeName) => updateAttribute(index, { attribute: attributeName })}
              placeholder="name"
              value={attribute.attribute}
            />
            <select
              aria-label="field kind"
              onChange={(event) => updateAttribute(index, { kind: event.target.value as AttributeKind })}
              value={attribute.kind}
            >
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
            <button
              aria-label={`remove ${attribute.attribute}`}
              className="field-remove"
              onClick={() => commitAttributes(schema.attributes.filter((_, at) => at !== index))}
              type="button"
            >
              ✕
            </button>
          </div>
        ))}

        <div className="schema-field-row is-draft" key={draftGeneration}>
          {/* Two leading spacers, not one: the row has a handle column and
              a star/eye column, and a short row slid its input into the
              narrow one. */}
          <span />
          <span />
          <SettleInput
            ariaLabel="new field name"
            onCommit={(attribute) => addDraft({ attribute })}
            placeholder="name"
            value={draftRow.attribute}
          />
          <select
            aria-label="new field kind"
            onChange={(event) => setDraftRow({ ...draftRow, kind: event.target.value as AttributeKind })}
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
