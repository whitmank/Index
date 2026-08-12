// Authored by Karter Whitman using Claude Opus 4.8
// The focus view: an item opened up (PRODUCT-SPEC §3.4). Two independent
// machines compose it — the renderer draws the content, chosen by format;
// the layout arranges the screen, chosen by the presentation cascade. The
// layout never overrides the renderer.
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
import { SettleInput } from "../../components/SettleInput.tsx";
import { isPublic } from "../../components/itemActions.ts";
import { resolveLayout, type ClaimedConnection } from "../../layouts/registry.tsx";
import { KnownFields } from "../../layouts/parts/KnownFields.tsx";
import { attachResource } from "../../lib/resources.js";
import { MEMBER_OF_LABEL_ID } from "../../lib/seeds.js";
import { expandSpotifyAlbum } from "../../lib/spotify.js";
import { errors, loadItem, pool, usePool } from "../../store/index.js";
import { ConnectionComposer, type Outbound } from "./ConnectionComposer.tsx";
import { FieldsEditor } from "./FieldsEditor.tsx";
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
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  // Fetched eagerly, once per mount — the layout cascade now needs the
  // full list to resolve a typed item's known fields, not just the type
  // chip's dropdown, so this can no longer wait for that menu to open.
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

  // The outbound statements, resolved to the items they point at.
  const outbound = usePool<Outbound[]>(() =>
    pool.outboundFrom(itemId).flatMap((connection) => {
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

  // The tags, oldest first — the order the cascade reads them in.
  const tags = usePool(() =>
    pool
      .outboundFrom(itemId)
      .filter((connection) => connection.label === MEMBER_OF_LABEL_ID)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .flatMap((connection) => {
        const target = pool.getItem(connection.target);
        return target ? [{ name: target.display_name ?? target.name }] : [];
      }),
  );

  const resolution = useMemo(
    () => (item ? resolveLayout(item, tags, schemas) : null),
    [item, tags, schemas],
  );

  const claimedConnections = useMemo<ClaimedConnection[]>(() => {
    const wantedLabels = resolution?.entry.labels ?? [];
    return outbound
      .filter((connection) => connection.label && wantedLabels.includes(connection.label))
      .map((connection) => ({
        label: connection.label ?? "",
        targetId: connection.targetId,
        targetName: connection.targetName,
      }));
  }, [outbound, resolution]);

  // What a layout claims into its own dedicated slot — an album's
  // tracks, a movie's author — is intrinsic to that slot, not a loose
  // connection to also offer (and remove) from the generic composer.
  const composerOutbound = useMemo(() => {
    const wantedLabels = resolution?.entry.labels ?? [];
    return outbound.filter(
      (connection) => !(connection.label && wantedLabels.includes(connection.label)),
    );
  }, [outbound, resolution]);

  if (!item || !resolution) return null;

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

  const Layout = resolution.entry.Component;
  const knownFields = resolution.entry.fields ?? [];

  // Which resource the carousel opens on — a layout's own preference
  // (MovieLayout's trailer, say) when it has one, else the primary
  // resource, today's behavior.
  const preferredResource = resolution.entry.preferredResource;
  const startIndex = preferredResource ? Math.max(0, item.resources.findIndex(preferredResource)) : 0;

  const content =
    item.resources.length > 1 ? (
      <ResourceCarousel initialIndex={startIndex} item={item} resources={item.resources} />
    ) : (
      <ResourceContent item={item} resource={item.resources[0]} />
    );

  // The layout's own known fields (title first, xyz-style — a big
  // identity field rather than a bar input) sit above the generic list,
  // which excludes them so nothing shows twice or gets clobbered on
  // commit.
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
      <FieldsEditor exclude={knownFields.map((field) => field.name)} item={item} />
      <ResourcesEditor item={item} />
      <ConnectionComposer
        item={item}
        onNavigate={(id) => onGoTo({ id })}
        outbound={composerOutbound}
      />
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
                      className={schema.name === item.type ? "type-option is-current" : "type-option"}
                      onClick={() => {
                        setTypeMenuOpen(false);
                        if (schema.name !== item.type) void apply(changes.setType(item, schema.name));
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

        <Layout connections={claimedConnections} content={content} editor={editor} item={item} />
      </div>
    </div>
  );
}
