// Authored by Karter Whitman using Claude Sonnet 5
// Focus's top bar: type classification (chip, confirm, popover),
// public/delete/parse/close actions. Pulled out of Focus.tsx because
// it's the one piece every per-type arrangement will still want —
// classification and item-level actions don't change shape just because
// a movie's content/editor split does. Self-contained: fetches its own
// schemas and owns its own open/confirm/parsing state, so a future
// type-specific view only has to render `<FocusToolbar item={item}
// onDismiss={...} onGoTo={...} />` and nothing else.
import { useEffect, useState } from "react";
import type { Item, Schema } from "@index/database/types";
import { apply, changes } from "../../changes/index.js";
import { ParseIcon } from "../../components/ParseIcon.tsx";
import { isPublic } from "../../components/itemActions.ts";
import { sameTypeName } from "../../lib/derive.js";
import { parseItems } from "../../lib/parseItems.js";
import { isSystemId } from "../../lib/seeds.js";
import { pool, usePool } from "../../store/index.js";

function typeOf(item: Item): string | undefined {
  return item.data.type?.value as string | undefined;
}

/** The type chip's tooltip. It used to claim "you classified this" for
 * every typed item, including ones the classifier typed at intake and the
 * user never touched — `type.prov` is what lets it stop saying that,
 * and lets a guess point at the resource it came from. */
function typeProvenance(item: Item): string {
  if (!item.data.type) return "not yet classified";
  if (item.data.type.prov === "user") return "you set this — click to change";
  const primary = item.resources[0];
  return primary
    ? `guessed from ${primary.name} — click to change`
    : "guessed — click to change";
}

/** Whether there is a guess standing unanswered. A type the user chose
 * needs no agreeing with — picking it from the menu already said so. */
function awaitsConfirmation(item: Item): boolean {
  return Boolean(item.data.type) && item.data.type?.prov !== "user";
}

export interface FocusToolbarProps {
  item: Item;
  onDismiss: () => void;
  /** The shell's one navigation primitive, so "go in" behaves exactly as
   * clicking the same item anywhere else would. */
  onGoTo: (item: { id: string }) => void;
}

export function FocusToolbar({ item, onDismiss, onGoTo }: FocusToolbarProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
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

  const shared = usePool(() => isPublic(item));

  // Things you can look at; places you can also walk into. An item that
  // has become a place — because you tagged something into it — offers
  // the way in from here, rather than only from the home screen.
  const isPlace = usePool(() => pool.isPlace(item.id));

  return (
    <div className="focus-toolbar">
      <div className="type-trigger-wrap">
        <button
          className="type-trigger"
          onClick={() => setTypeMenuOpen((open) => !open)}
          title={typeProvenance(item)}
          type="button"
        >
          <span className="type-trigger-label">{item.data.type?.value ?? "untyped"}</span>
          <span className="type-trigger-caret" aria-hidden="true">
            ⌄
          </span>
        </button>

        {/* Present only while a guess is unanswered. Accepting it is
            what makes it go away, so the control's absence is the
            confirmed state — there is nothing left to ask. */}
        {awaitsConfirmation(item) && (
          <button
            aria-label={`confirm this item is a ${item.data.type?.value}`}
            className="type-confirm"
            onClick={() => void apply(changes.confirmType(item))}
            title="confirm this type, so changing resources won't revise it"
            type="button"
          >
            <span aria-hidden="true">✓</span>
          </button>
        )}

        {typeMenuOpen && (
          <ul className="type-popover">
            {schemas.length === 0 && (
              <li className="type-option-empty">no types yet — add one from the types button</li>
            )}
            {schemas.map((schema) => (
              <li key={schema.id}>
                <button
                  className={
                    typeOf(item) && sameTypeName(schema.name, typeOf(item) as string)
                      ? "type-option is-current"
                      : "type-option"
                  }
                  onClick={() => {
                    setTypeMenuOpen(false);
                    if (!typeOf(item) || !sameTypeName(schema.name, typeOf(item) as string)) {
                      void apply(changes.setType(item, schema.name));
                    }
                  }}
                  type="button"
                >
                  {schema.name}
                </button>
              </li>
            ))}
            {item.data.type && (
              <li>
                <button
                  className="type-option"
                  onClick={() => {
                    setTypeMenuOpen(false);
                    void apply(changes.setType(item, null));
                  }}
                  type="button"
                >
                  clear
                </button>
              </li>
            )}
          </ul>
        )}
      </div>

      {confirmingDelete ? (
        <div className="focus-confirm">
          <span>Delete this item?</span>
          <div className="focus-confirm-actions">
            <button onClick={() => setConfirmingDelete(false)} type="button">
              cancel
            </button>
            <button
              className="danger"
              onClick={() => {
                const change = changes.deleteItem(item);
                if (change) void apply(change).then(onDismiss);
              }}
              type="button"
            >
              confirm
            </button>
          </div>
        </div>
      ) : (
        <div className="focus-actions">
          {isPlace && (
            <button
              className="focus-enter"
              onClick={() => onGoTo({ id: item.id })}
              title="Show what is in here"
              type="button"
            >
              go in →
            </button>
          )}

          <label className="toggle">
            <input
              checked={shared}
              onChange={(event) => {
                const change = changes.setPublic(item, event.target.checked);
                if (change) void apply(change);
              }}
              type="checkbox"
            />
            public
          </label>

          {/* Reads the file and fills in what this type declares.
              Available only once the item has a type, because the
              type is the question it answers against — and using it
              settles that type, the way choosing one by hand does. */}
          <button
            aria-label="parse"
            className="item-screen-icon-button"
            disabled={!item.data.type || parsing}
            onClick={() => {
              setParsing(true);
              void parseItems([item]).finally(() => setParsing(false));
            }}
            title={
              item.data.type
                ? `read this file and fill in what a ${item.data.type.value} declares`
                : "give it a type first"
            }
            type="button"
          >
            <ParseIcon />
          </button>

          <button
            aria-label="Delete"
            className="item-screen-icon-button danger"
            disabled={isSystemId(item.id)}
            onClick={() => setConfirmingDelete(true)}
            title="Delete"
            type="button"
          >
            🗑
          </button>

          <button aria-label="close" className="item-screen-icon-button" onClick={onDismiss} type="button">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
