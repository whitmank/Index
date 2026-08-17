// Authored by Karter Whitman using Claude Opus 4.8
// The focus view: an item opened up (PRODUCT-SPEC §3.4). This file owns
// the whole screen — every category of content an item might have
// (its known fields from a type's schema, its ordered children, its
// loose connections, its resources) is derived here, unconditionally,
// for every item; nothing branches on `item.type` to decide *whether*
// to look. FocusLayout.tsx only arranges the resulting `content`/
// `editor` bundles on screen and carries no logic of its own — the
// renderer still draws the content itself, chosen by format,
// independently of both.
//
// layouts/registry.tsx's old per-type cascade (a different Layout
// Component, and different claimed fields/connections, per type or tag)
// is retired from this path — every item renders through FocusLayout
// regardless of type or tags — but stays in the tree, unimported here,
// as reference for when type-specific arrangements come back.
//
// A brand-new item that is still empty when it falls off the trail is
// discarded rather than kept: you opened something, looked at it, and
// moved on, and nothing about that is worth remembering. That check now
// lives in App.tsx's `arriveAt` (not here) — a crumb click or a fresh
// `enter` elsewhere can drop this item from the trail without this
// component's own dismiss ever firing, so it has to live where every
// trail change is guaranteed to pass through.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Item, Schema } from "@index/database/types";
import { apply, changes } from "../../changes/index.js";
import { ParseIcon } from "../../components/ParseIcon.tsx";
import { SettleInput } from "../../components/SettleInput.tsx";
import { isPublic } from "../../components/itemActions.ts";
import { ChildrenList, type ChildRow } from "../../layouts/parts/ChildrenList.tsx";
import { KnownFields } from "../../layouts/parts/KnownFields.tsx";
import { useOrderedChildren } from "../../layouts/parts/useOrderedChildren.ts";
import { knownFieldsFor, sameTypeName } from "../../lib/derive.js";
import { parseItems } from "../../lib/parseItems.js";
import { attachResource } from "../../lib/resources.js";
import { expandSpotifyAlbum } from "../../lib/spotify.js";
import { errors, loadItem, pool, usePool } from "../../store/index.js";
import { ConnectionComposer, type Outbound } from "./ConnectionComposer.tsx";
import { FieldsEditor } from "./FieldsEditor.tsx";
import { FocusLayout } from "./FocusLayout.tsx";
import { ResourceCarousel } from "./ResourceCarousel.tsx";
import { ResourceContent } from "./ResourceContent.tsx";
import { ResourcesEditor } from "./ResourcesEditor.tsx";

/** The type chip's tooltip. It used to claim "you classified this" for
 * every typed item, including ones the classifier typed at intake and the
 * user never touched — `type_source` is what lets it stop saying that,
 * and lets a guess point at the resource it came from. */
function typeProvenance(item: Item): string {
  if (!item.type) return "not yet classified";
  if (item.type_source === "user") return "you set this — click to change";
  const primary = item.resources[0];
  return primary
    ? `guessed from ${primary.name} — click to change`
    : "guessed — click to change";
}

/** Whether there is a guess standing unanswered. A type the user chose
 * needs no agreeing with — picking it from the menu already said so — and
 * a legacy row with no recorded source counts as unanswered, since
 * nothing on it says a person decided. */
function awaitsConfirmation(item: Item): boolean {
  return Boolean(item.type) && item.type_source !== "user";
}

/** A child's trailing bit in its ordered-children row — a song's length
 * today, whatever else a future child carries under this name tomorrow.
 * Reads a field literally named "duration"; nothing here knows or cares
 * that the parent happens to be an album. */
function durationOf(child: Item): string {
  const field = child.fields.find((candidate) => candidate.name.toLowerCase() === "duration");
  return typeof field?.value === "string" ? field.value : "";
}

export interface FocusProps {
  itemId: string;
  /** True when this item was created by the gesture that opened it. */
  isNew?: boolean;
  onDismiss: () => void;
  /** The shell's one navigation primitive, so following a connection
   * behaves exactly as clicking the same item anywhere else would. */
  onGoTo: (item: { id: string }) => void;
}

export function Focus({ itemId, isNew, onDismiss, onGoTo }: FocusProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  // Fetched eagerly, once per mount — knownFieldsFor needs the full list
  // to resolve a typed item's known fields, not just the type chip's
  // dropdown, so this can no longer wait for that menu to open.
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

  // The scrim fades in rather than snapping to full dark — two rAFs so
  // the hidden state paints first, or the transition has nothing to
  // animate from.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setVisible(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);

  // A paste event only bubbles from whatever currently has DOM focus. A
  // brand-new item's name field grabs it via `autoFocus` below, but
  // opening an *existing* item moves nothing — without this, pasting
  // right after opening one would land on whatever was focused in the
  // view behind it, not here. Runs once per mount, which `key={itemId}`
  // at the call site (App.tsx) makes exactly "once per item opened."
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
  }, []);

  const item = usePool(() => pool.getItem(itemId));

  useEffect(() => {
    void loadItem(itemId);
  }, [itemId]);

  // The outbound statements, resolved to the items they point at — every
  // one except a connection marked `child`, which is a different shape
  // (see `children` below) and shows there instead, not here too.
  const outbound = usePool<Outbound[]>(() =>
    pool
      .outboundFrom(itemId)
      .filter((connection) => !connection.child)
      .flatMap((connection) => {
        const target = pool.getItem(connection.target);
        if (!target) return [];
        return [
          {
            connectionId: connection.id,
            label: connection.label ? connection.label.replace(/^labels:/, "") : null,
            targetId: target.id,
            targetName: target.display_name ?? target.name,
          },
        ];
      }),
  );

  // A parent's ordered children — an album's tracks today, whatever else
  // gets built as a `child: true` connection tomorrow. Not gated on
  // `item.type`: any item with children shows them, the same way any
  // item with fields or connections shows those.
  const children = useOrderedChildren(itemId);
  const childRows = useMemo<ChildRow[]>(
    () =>
      children.map(({ connection, item: child }, index) => ({
        id: connection.id,
        index: index + 1,
        primary: child.display_name ?? (child.name || "untitled"),
        trailing: durationOf(child),
      })),
    [children],
  );

  const shared = usePool(() => (item ? isPublic(item) : false));

  // Things you can look at; places you can also walk into. An item that
  // has become a place — because you tagged something into it — offers
  // the way in from here, rather than only from the home screen.
  const isPlace = usePool(() => pool.isPlace(itemId));

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      // ← / A back out of the view the same way Escape does — the trail's
      // own back gesture (useArrowNav) stands down while an overlay is up,
      // so this is the only way left/A means "back" once you're in one.
      const isBack =
        event.key === "ArrowLeft" || (event.key.toLowerCase() === "a" && !event.metaKey && !event.ctrlKey && !event.altKey);
      if (event.key !== "Escape" && !isBack) return;
      // Escape (or ←/A) inside a text input belongs to the field — it
      // abandons the draft there, and only a second press closes the view.
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /input|textarea/i.test(target.tagName))) {
        return;
      }
      onDismiss();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  // A type's own known fields — everything a schema declares beyond the
  // identity field, minus anything it marks hidden. Not part of a
  // cascade: an untyped item, or one whose type names no schema, simply
  // gets none, and the generic FieldsEditor draws everything instead.
  const knownFields = useMemo(
    () => (item ? knownFieldsFor(item.type, schemas) : []),
    [item, schemas],
  );

  if (!item) return null;

  /** A file dropped or pasted anywhere on the focused item, or a link
   * dragged/pasted in the same way, becomes a resource on *this* item —
   * the in-focus counterpart to the shell's own drop-anywhere, which
   * mints a new item instead (App.tsx's `onDropAnywhere`). Calling
   * `preventDefault` here is what keeps that shell handler from also
   * firing: it only acts when the event reaches it unclaimed. */
  const attachDropped = async (inputs: string[]): Promise<void> => {
    const trimmed = inputs.map((entry) => entry.trim()).filter(Boolean);
    if (trimmed.length === 0) return;
    const answer = await window.index.intake.pathsToResources(trimmed);
    if ("err" in answer) {
      errors.surface(answer.err);
      return;
    }
    for (const { resource } of answer.ok.results) {
      // A Spotify album link gets its songs bundled into the same change
      // as the resource itself — one undo for the whole import. Unlike
      // `lib/intake.ts`'s brand-new-item path, this deliberately leaves
      // the item's own `name` alone: you already named it, attaching a
      // link to it shouldn't rename it out from under you.
      const expansion = await expandSpotifyAlbum(item, resource);
      if (!expansion) {
        await apply(await attachResource(item, resource));
        continue;
      }
      await apply({
        description: `Attach '${expansion.albumName}' as an album, with its songs`,
        pairs: [
          {
            before: item,
            after: { ...item, resources: [...item.resources, resource], ...expansion.itemPatch },
          },
          ...expansion.extraPairs,
        ],
      });
    }
  };

  const content =
    item.resources.length > 1 ? (
      <ResourceCarousel initialIndex={0} item={item} resources={item.resources} />
    ) : (
      <ResourceContent item={item} resource={item.resources[0]} />
    );

  // A type's own known fields (title first, xyz-style — a big identity
  // field rather than a bar input) sit above the generic list, which
  // excludes them so nothing shows twice or gets clobbered on commit.
  // Ordered children sit right below — as central to what the item *is*
  // as its known fields — ahead of the generic misc fields, resources
  // and loose connections.
  const editor = (
    <>
      <label className="field field-name">
        <span className="sr-only">name</span>
        <SettleInput
          ariaLabel="name"
          autoFocus={isNew}
          onCommit={(name) => void apply(changes.rename(item, name))}
          placeholder="unnamed"
          value={item.name}
        />
      </label>
      <KnownFields fields={knownFields} item={item} />
      <ChildrenList rows={childRows} />
      <FieldsEditor exclude={knownFields.map((field) => field.name)} item={item} />
      <ResourcesEditor item={item} />
      <ConnectionComposer item={item} onNavigate={(id) => onGoTo({ id })} outbound={outbound} />
    </>
  );

  return (
    <div
      className={visible ? "focus-backdrop visible" : "focus-backdrop"}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const files = [...event.dataTransfer.files];
        if (files.length > 0) {
          void attachDropped(files.map((file) => window.index.intake.pathForFile(file)));
          return;
        }
        // A link dragged in from a browser tab or address bar carries no
        // File — just the url as text.
        const link = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
        if (link.trim()) void attachDropped([link]);
      }}
      onPaste={(event) => {
        // An ordinary paste into a field — the name, a field value —
        // belongs to that field; only claim it when nothing editable is
        // where the paste landed.
        const target = event.target;
        if (target instanceof HTMLElement && (target.isContentEditable || /input|textarea/i.test(target.tagName))) {
          return;
        }
        const files = [...event.clipboardData.files];
        if (files.length > 0) {
          event.preventDefault();
          void attachDropped(files.map((file) => window.index.intake.pathForFile(file)));
          return;
        }
        const text = event.clipboardData.getData("text/plain").trim();
        if (text) {
          event.preventDefault();
          void attachDropped([text]);
        }
      }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <div className={visible ? "focus visible" : "focus"} ref={panelRef} role="dialog" tabIndex={-1}>
        <div className="focus-toolbar">
          <div className="type-trigger-wrap">
            <button
              className="type-trigger"
              onClick={() => setTypeMenuOpen((open) => !open)}
              title={typeProvenance(item)}
              type="button"
            >
              <span className="type-trigger-label">{item.type ?? "untyped"}</span>
              <span className="type-trigger-caret" aria-hidden="true">
                ⌄
              </span>
            </button>

            {/* Present only while a guess is unanswered. Accepting it is
                what makes it go away, so the control's absence is the
                confirmed state — there is nothing left to ask. */}
            {awaitsConfirmation(item) && (
              <button
                aria-label={`confirm this item is a ${item.type}`}
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
                  <li className="opens-as-empty">no types yet — add one from the types button</li>
                )}
                {schemas.map((schema) => (
                  <li key={schema.id}>
                    <button
                      className={
                        item.type && sameTypeName(schema.name, item.type)
                          ? "type-option is-current"
                          : "type-option"
                      }
                      onClick={() => {
                        setTypeMenuOpen(false);
                        if (!item.type || !sameTypeName(schema.name, item.type)) {
                          void apply(changes.setType(item, schema.name));
                        }
                      }}
                      type="button"
                    >
                      {schema.label ?? schema.name}
                    </button>
                  </li>
                ))}
                {item.type && (
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
                  onClick={() => onGoTo({ id: itemId })}
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
                disabled={!item.type || parsing}
                onClick={() => {
                  setParsing(true);
                  void parseItems([item]).finally(() => setParsing(false));
                }}
                title={
                  item.type
                    ? `read this file and fill in what a ${item.type} declares`
                    : "give it a type first"
                }
                type="button"
              >
                <ParseIcon />
              </button>

              <button
                aria-label="Delete"
                className="item-screen-icon-button danger"
                disabled={item.system}
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

        <FocusLayout content={content} editor={editor} />
      </div>
    </div>
  );
}
