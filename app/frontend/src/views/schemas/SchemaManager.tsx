// Authored by Karter Whitman using Claude Sonnet 5
// The schema manager: create a type, name its fields. A schema is data,
// not code (database/types.ts) — this is the one place that data gets
// written, the same relationship FieldsEditor has to an item's fields.
// Schemas sit outside the Change model, like labels: there is nothing
// about a type's shape to undo, only its current shape.
//
// `SchemaEditor` is the list-and-editor itself; `SchemaManager` is that
// plus a standalone modal's backdrop and header — Settings' Types tab
// wants the first without the second.
import { useEffect, useRef, useState } from "react";
import type { FieldKind, Schema, SchemaField } from "@index/database/types";
import { SettleInput } from "../../components/SettleInput.tsx";

const KINDS: FieldKind[] = ["string", "number", "date", "list"];

export interface SchemaManagerProps {
  onClose: () => void;
}

type Draft = Pick<Schema, "name" | "label" | "fields">;

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
    save({ name, label: null, fields: [] });
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
            {schema.label ?? schema.name}
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
        {selected && <FieldsList key={selected.id} onSave={save} schema={selected} />}
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

/** The selected type's field list — one row per field, plus a standing
 * draft row, exactly FieldsEditor's shape one level up (defining fields
 * instead of filling them in). */
function FieldsList({ schema, onSave }: { schema: Schema; onSave: (next: Draft) => void }) {
  const [draftRow, setDraftRow] = useState<SchemaField>({ name: "", label: null, kind: "string" });
  // SettleInput only clears its own typed text when its `value` prop
  // changes — and the draft row's value is "" both before typing and
  // after commit, so committing never actually changes it. Remounting
  // the row on a fresh key is what makes it forget what was typed.
  const [draftGeneration, setDraftGeneration] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const fieldsRef = useRef<HTMLDivElement>(null);

  const commitFields = (fields: SchemaField[]): void => {
    onSave({ name: schema.name, label: schema.label, fields: fields.filter((f) => f.name.trim() !== "") });
  };

  const updateField = (index: number, patch: Partial<SchemaField>): void => {
    const next = schema.fields.map((field, at) => (at === index ? { ...field, ...patch } : field));
    commitFields(next);
  };

  const addDraft = (patch: Partial<SchemaField>): void => {
    const row = { ...draftRow, ...patch };
    if (row.name.trim() === "") {
      setDraftRow(row);
      return;
    }
    setDraftRow({ name: "", label: null, kind: "string" });
    setDraftGeneration((generation) => generation + 1);
    commitFields([...schema.fields, row]);
  };

  /** Which real field the pointer is over — the standing draft row at
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

  /** A field's order is the array's order — there is no arrow to move,
   * so this writes the whole reordered list back in one save, the same
   * as any other field edit. */
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
      const next = [...schema.fields];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved as SchemaField);
      commitFields(next);
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
  };

  return (
    <section className="schema-editor-block">
      <h3>{schema.name}</h3>

      <div className="schema-fields" ref={fieldsRef}>
        {schema.fields.map((field, index) => (
          <div
            className={dragging === index ? "schema-field-row is-dragging" : "schema-field-row"}
            key={`${field.name}-${index}`}
          >
            <button
              aria-label="reorder"
              className="schema-field-handle"
              onPointerDown={(event) => startReorder(event, index)}
              type="button"
            >
              ⠿
            </button>

            {/* Fixed width whether or not it holds a star, so every row's
                input starts at the same x — the resources list marks its
                primary the same way, and for the same reason: the first
                one is the one that decides something. */}
            <span
              className="schema-field-primary-indicator"
              title={index === 0 ? "names the item — drag another field above to change it" : undefined}
            >
              {index === 0 && (
                <>
                  ★<span className="sr-only">Names the item</span>
                </>
              )}
            </span>
            <SettleInput
              ariaLabel="field name"
              onCommit={(name) => updateField(index, { name })}
              placeholder="name"
              value={field.name}
            />
            <select
              aria-label="field kind"
              onChange={(event) => updateField(index, { kind: event.target.value as FieldKind })}
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
              onClick={() => commitFields(schema.fields.filter((_, at) => at !== index))}
              type="button"
            >
              ✕
            </button>
          </div>
        ))}

        <div className="schema-field-row is-draft" key={draftGeneration}>
          <span />
          <SettleInput
            ariaLabel="new field name"
            onCommit={(name) => addDraft({ name })}
            placeholder="name"
            value={draftRow.name}
          />
          <select
            aria-label="new field kind"
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
