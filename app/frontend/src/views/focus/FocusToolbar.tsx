// Authored by Karter Whitman using Claude Sonnet 5
// Focus's top bar: type classification (chip, confirm, popover),
// public/delete/parse/close actions. Pulled out of Focus.tsx because
// it's the one piece every per-type arrangement will still want —
// classification and item-level actions don't change shape just because
// a movie's content/editor split does. Self-contained: fetches its own
// schemas and owns its own open/confirm/parsing state, so a future
// type-specific view only has to render `<FocusToolbar item={item}
// onDismiss={...} onGoTo={...} />` and nothing else.
import { useEffect, useRef, useState } from "react";
import type { Item, Schema } from "@index/database/types";
import { apply, changes } from "../../changes/index.js";
import { ParseIcon } from "../../components/ParseIcon.tsx";
import { SyncIcon } from "../../components/SyncIcon.tsx";
import { isPublic } from "../../components/itemActions.ts";
import { useAnswerKeys } from "../../hooks/useAnswerKeys.ts";
import { sameTypeName } from "../../lib/derive.js";
import { parseItems } from "../../lib/parseItems.js";
import { isSystemId } from "../../lib/seeds.js";
import { expandSpotifyAlbum, isSpotifyAlbumUrl } from "../../lib/spotify.js";
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
  /** Right-clicking the type chip's shortcut to that type's schema in
   * Settings, rather than making you open Settings and hunt for it. */
  onOpenTypeSettings: (typeName: string) => void;
}

export function FocusToolbar({ item, onDismiss, onGoTo, onOpenTypeSettings }: FocusToolbarProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [fetchingSpotify, setFetchingSpotify] = useState(false);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [schemas, setSchemas] = useState<Schema[]>([]);

  // Present only when a resource actually is a Spotify album link — the
  // manual counterpart to `parse`, for the one source that isn't a local
  // file `parse` can reread: refetching means asking Spotify again, not
  // rereading anything already on disk.
  const spotifyResource = item.resources.find((resource) => isSpotifyAlbumUrl(resource.uri));

  const refetchSpotify = async (): Promise<void> => {
    if (!spotifyResource) return;
    setFetchingSpotify(true);
    try {
      const expansion = await expandSpotifyAlbum(item, spotifyResource);
      if (!expansion) return;
      await apply({
        description: `Refresh '${expansion.albumName}' from Spotify`,
        pairs: [{ before: item, after: { ...item, ...expansion.itemPatch } }, ...expansion.extraPairs],
      });
    } finally {
      setFetchingSpotify(false);
    }
  };

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

  // Direct children (an album's tracks, say) — what makes the delete
  // confirm ask "just this, or this and them" instead of a plain
  // yes/no. Deleting without answering that would otherwise silently
  // leave every child behind as its own orphaned item.
  const children = usePool(() => pool.childrenOf(item.id));

  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const deleteChildrenRef = useRef<HTMLButtonElement>(null);
  const deleteJustThisRef = useRef<HTMLButtonElement>(null);

  // The primary answer is what a fresh "Delete this item?" starts
  // focused on, the same as the modal Confirm does — arriving here is
  // already the deliberate keystroke; the prompt shouldn't cost another
  // just to be answerable by keyboard.
  useEffect(() => {
    if (confirmingDelete) deleteJustThisRef.current?.focus();
  }, [confirmingDelete]);

  const deleteJustThis = (): void => {
    const change = changes.deleteItem(item);
    if (change) void apply(change).then(onDismiss);
  };

  const deleteWithChildren = (): void => {
    const change = changes.deleteItem(item, { recursive: true });
    if (change) void apply(change).then(onDismiss);
  };

  const onDeleteConfirmKeyDown = useAnswerKeys(
    [
      { ref: cancelDeleteRef, onChoose: () => setConfirmingDelete(false) },
      ...(children.length > 0 ? [{ ref: deleteChildrenRef, onChoose: deleteWithChildren }] : []),
      { ref: deleteJustThisRef, onChoose: deleteJustThis },
    ],
    {
      onAlt: children.length > 0 ? deleteWithChildren : undefined,
      onCancel: () => setConfirmingDelete(false),
    },
  );

  return (
    <div className="focus-toolbar">
      <div className="type-trigger-wrap">
        <button
          className="type-trigger"
          onClick={() => setTypeMenuOpen((open) => !open)}
          onContextMenu={(event) => {
            const typeName = typeOf(item);
            if (!typeName) return;
            event.preventDefault();
            onOpenTypeSettings(typeName);
          }}
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
        <div className="focus-confirm" onKeyDown={onDeleteConfirmKeyDown}>
          <span>
            {children.length > 0
              ? `Delete just this, or with its ${children.length} ${children.length === 1 ? "child" : "children"} too?`
              : "Delete this item?"}
          </span>
          <div className="focus-confirm-actions">
            <button onClick={() => setConfirmingDelete(false)} ref={cancelDeleteRef} type="button">
              cancel
            </button>
            {children.length > 0 && (
              <button className="danger" onClick={deleteWithChildren} ref={deleteChildrenRef} type="button">
                {`and ${children.length === 1 ? "the child" : `all ${children.length} children`}`}
              </button>
            )}
            <button className="danger" onClick={deleteJustThis} ref={deleteJustThisRef} type="button">
              {children.length > 0 ? "just this" : "confirm"}
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

          {/* Asks Spotify for this album again — artist, date, duration,
              and its songs, the same expansion an album link runs through
              the first time it's attached. Manual, because nothing here
              watches for the metadata changing on Spotify's end; this is
              how you'd notice or correct it. */}
          {spotifyResource && (
            <button
              aria-label="refetch from Spotify"
              className="item-screen-icon-button"
              disabled={fetchingSpotify}
              onClick={() => void refetchSpotify()}
              title="ask Spotify for this album's data again"
              type="button"
            >
              <SyncIcon />
            </button>
          )}

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
