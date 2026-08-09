// Authored by Karter Whitman using Claude Opus 4.8
// The focus view: an item opened up (PRODUCT-SPEC §3.4). Two independent
// machines compose it — the renderer draws the content, chosen by format;
// the layout arranges the screen, chosen by the presentation cascade. The
// layout never overrides the renderer.
//
// A brand-new item that is still empty when you dismiss it is discarded
// rather than kept: you opened something, looked at it, and closed it, and
// nothing about that is worth remembering. That discard is deliberately
// not undo-tracked.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Item, Schema } from "@index/database/types";
import { apply, applyUntracked, changes } from "../../changes/index.js";
import { SettleInput } from "../../components/SettleInput.tsx";
import { isPublic } from "../../components/itemActions.ts";
import { KnownFields, layouts, resolveLayout, type ClaimedConnection } from "../../layouts/registry.tsx";
import { formatOf } from "../../lib/derive.js";
import { rendererFor } from "../../renderers/registry.tsx";
import { loadItem, pool, usePool } from "../../store/index.js";
import { ConnectionComposer, type Outbound } from "./ConnectionComposer.tsx";
import { FieldsEditor } from "./FieldsEditor.tsx";
import { ResourcesEditor } from "./ResourcesEditor.tsx";

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
  const [openAsOpen, setOpenAsOpen] = useState(false);
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

  /** An item is "still empty" when nothing has been said about it. */
  const isEmpty = useCallback(
    (candidate: Item): boolean =>
      candidate.name.trim() === "" &&
      !candidate.display_name &&
      !candidate.type &&
      candidate.resources.length === 0 &&
      candidate.fields.length === 0 &&
      pool.connectionsTouching(candidate.id).length === 0,
    [],
  );

  const dismiss = useCallback(() => {
    const current = pool.getItem(itemId);
    if (isNew && current && isEmpty(current)) {
      // Not undo-tracked: there is nothing here to walk back to.
      const discard = changes.deleteItem(current);
      if (discard) void applyUntracked(discard);
    }
    onDismiss();
  }, [isNew, itemId, isEmpty, onDismiss]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      // Escape inside a text input belongs to the field — it abandons the
      // draft there, and only a second press closes the view.
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /input|textarea/i.test(target.tagName))) {
        return;
      }
      dismiss();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dismiss]);

  // The tags, oldest first — the order the cascade reads them in.
  const tags = usePool(() =>
    pool
      .outboundFrom(itemId)
      .filter((connection) => connection.label === null)
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
    if (!resolution) return [];
    const wantedLabels = resolution.entry.labels ?? [];
    return outbound
      .filter((connection) => connection.label && wantedLabels.includes(connection.label))
      .map((connection) => ({
        label: connection.label ?? "",
        targetId: connection.targetId,
        targetName: connection.targetName,
      }));
  }, [outbound, resolution]);

  if (!item || !resolution) return null;

  const format = formatOf(item);
  const renderer = rendererFor(format);
  const Layout = resolution.entry.Component;
  const Content = renderer.Component;
  const knownNames = resolution.entry.fields ?? [];

  const content = (
    <div className={`content-slot fit-${renderer.fit}`}>
      <Content item={item} />
    </div>
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
      <KnownFields item={item} names={knownNames} />
      <FieldsEditor exclude={knownNames} item={item} />
      <ResourcesEditor item={item} />
      <ConnectionComposer
        item={item}
        onNavigate={(id) => onGoTo({ id })}
        outbound={outbound}
      />
    </>
  );

  return (
    <div
      className={visible ? "focus-backdrop visible" : "focus-backdrop"}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <div className={visible ? "focus visible" : "focus"} role="dialog">
        <header className="focus-bar">
          <div className="focus-bar-spacer" aria-hidden="true" />

          <div className="type-trigger-wrap">
            <button
              className="type-trigger"
              onClick={() => setTypeMenuOpen((open) => !open)}
              title={item.type ? "you classified this — click to change" : "not yet classified"}
              type="button"
            >
              <span className="type-trigger-label">{item.type ?? "untyped"}</span>
              <span className="type-trigger-caret" aria-hidden="true">
                ⌄
              </span>
            </button>

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

              <div className="opens-as">
                <button
                  className={resolution.source === "override" ? "chip is-override" : "chip"}
                  onClick={() => setOpenAsOpen((open) => !open)}
                  title={
                    resolution.source === "tag"
                      ? `inferred from the '${resolution.key}' tag`
                      : resolution.source === "type"
                        ? `inferred from its type`
                        : resolution.source === "override"
                          ? "you chose this"
                          : "the default layout"
                  }
                  type="button"
                >
                  opens as {resolution.key}
                </button>

                {openAsOpen && (
                  <ul className="opens-as-menu">
                    {Object.keys(layouts).map((key) => (
                      <li key={key}>
                        <button
                          onClick={() => {
                            setOpenAsOpen(false);
                            // Choosing what inference already says retires
                            // the override rather than writing agreement.
                            const next = key === resolution.inferred ? null : key;
                            if (next !== item.opens) void apply(changes.setOpens(item, next));
                          }}
                          type="button"
                        >
                          {key}
                          {key === resolution.inferred ? " (from its tags)" : ""}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

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

              <button aria-label="close" className="item-screen-icon-button" onClick={dismiss} type="button">
                ✕
              </button>
            </div>
          )}
        </header>

        <Layout connections={claimedConnections} content={content} editor={editor} item={item} />
      </div>
    </div>
  );
}
