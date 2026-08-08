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
import type { Item } from "@index/database/types";
import { apply, applyUntracked, changes } from "../../changes/index.js";
import { SettleInput } from "../../components/SettleInput.tsx";
import { isPublic } from "../../components/itemActions.ts";
import { layouts, resolveLayout, type Claimed } from "../../layouts/registry.tsx";
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
    () => (item ? resolveLayout(item, tags) : null),
    [item, tags],
  );

  const claimed = useMemo<Claimed>(() => {
    if (!item || !resolution) return { fields: [], connections: [] };
    const wantedFields = resolution.entry.fields ?? [];
    const wantedLabels = resolution.entry.labels ?? [];
    return {
      fields: item.fields
        .filter((field) => wantedFields.includes(field.name))
        .map((field) => ({ name: field.name, value: field.value })),
      connections: outbound
        .filter((connection) => connection.label && wantedLabels.includes(connection.label))
        .map((connection) => ({
          label: connection.label ?? "",
          targetId: connection.targetId,
          targetName: connection.targetName,
        })),
    };
  }, [item, outbound, resolution]);

  if (!item || !resolution) return null;

  const format = formatOf(item);
  const renderer = rendererFor(format);
  const Layout = resolution.entry.Component;
  const Content = renderer.Component;

  const content = (
    <div className={`content-slot fit-${renderer.fit}`}>
      <Content item={item} />
    </div>
  );

  // Anything the layout claimed is shown by the layout; the generic
  // editor still owns all of it, so nothing becomes uneditable by being
  // promoted into a slot.
  const editor = (
    <>
      <FieldsEditor item={item} />
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
      <div className="focus" role="dialog">
        <header className="focus-bar">
          <SettleInput
            ariaLabel="name"
            autoFocus={isNew}
            className="focus-name"
            onCommit={(name) => void apply(changes.rename(item, name))}
            placeholder="unnamed"
            value={item.name}
          />

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

            {confirmingDelete ? (
              <button
                className="danger"
                onClick={() => {
                  const change = changes.deleteItem(item);
                  if (change) void apply(change).then(onDismiss);
                }}
                type="button"
              >
                really delete
              </button>
            ) : (
              <button
                className="danger"
                disabled={item.system}
                onClick={() => setConfirmingDelete(true)}
                onBlur={() => setConfirmingDelete(false)}
                type="button"
              >
                delete
              </button>
            )}

            <button aria-label="close" className="focus-close" onClick={dismiss} type="button">
              ✕
            </button>
          </div>
        </header>

        <Layout claimed={claimed} content={content} editor={editor} item={item} />
      </div>
    </div>
  );
}
