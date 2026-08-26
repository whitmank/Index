// Authored by Karter Whitman using Claude Opus 4.8
// The list view: a set's members as rows, sortable by their intrinsic
// fields (PRODUCT-SPEC §3.4).
//
// A list with no manual order sorts by what the items *are*, the way a
// canvas with no positions lets physics settle the nodes. Dragging a row
// is the moment an opinion appears: `order` materialises on the arrows to
// this set, and the chip that appears says so — with an ✕ that clears
// every one of them in a single change.
//
// A row answers to the clicks a row has always answered to: one selects
// it, two open it, ⇧ takes the range, ⌘ toggles. This is the one place
// the shell's "a single click goes" rule is set aside, and deliberately
// — a list is a place for choosing among things, and every list anyone
// has used works this way. The canvas, where you are aiming at one thing
// at a time, still goes on a single click.
//
// A child item — a song under its album, say — never appears as its own
// top-level row (Canvas hides it the same way). It's drawn nested under
// its parent instead, one level deep, shown only once the parent is
// expanded. `visible` is the flattened result — top-level rows with each
// expanded parent's children spliced in right after it — and is the one
// array every interaction (click, shift-click, arrow-nav, drag-reorder)
// reads, exactly as `sorted` used to be before hierarchy existed.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Item } from "@index/database/types";
import { apply, changes } from "../../changes/index.js";
import { ContextMenu, type MenuAnchor } from "../../components/ContextMenu.tsx";
import { DeviceIcon } from "../../components/DeviceIcon.tsx";
import { itemMenu } from "../../components/itemActions.ts";
import { isEditing } from "../../hooks/useUndoRedo.ts";
import { captionOf, deviceKindOf, deviceOf, type DeviceKind, nodeImageUrl } from "../../lib/derive.js";
import { MEMBER_OF_LABEL_ID } from "../../lib/seeds.js";
import { PIN_GLYPH, PLACE_GLYPH } from "../../lib/sets.js";
import { pool, selection, usePool, useSelection, useSelfDevice } from "../../store/index.js";

type SortKey = "name" | "date_added" | "device";

export interface ListProps {
  setId: string;
  itemIds: string[];
  /** Which of `itemIds` are here only by a pinned arrow, not this set's
   * own rule — empty for a set with no rule. */
  pinnedIds?: string[];
  /** The shell's one navigation primitive. */
  onGoTo: (item: Item, isNew?: boolean) => void;
  /** A row's context-menu "Delete" — asks the shell rather than deleting
   * outright, so the same confirm dialog (and the same "delete its
   * children too?" question) answers here as everywhere else. */
  onDeleteRequested?: (item: Item) => void;
  /** Someone left the set; who is in it has to be read again, since
   * membership is the union of a query and the arrows, and only the
   * backend knows the first half. */
  onMembersChanged?: () => void;
}

interface Row {
  item: Item;
  type: string | null;
  /** The raw device label — what "device" sorts by; finer-grained than
   * `kind` (a mounted device's own name, not just "remote"). */
  device: string;
  /** What the device column draws — null when there is no resource to
   * have a location at all. */
  kind: DeviceKind | null;
  order: number | null;
  /** Whether this row is a place (enterable) rather than a thing (opens). */
  place: boolean;
  /** Here by a pinned arrow the set's own rule wouldn't have matched. */
  pinned: boolean;
}

/** A row as actually drawn: `depth` 1 is a child, nested under the
 * top-level row immediately above it. `hasChildren` is only ever true at
 * depth 0 — nesting stops one level deep. */
interface VisibleRow extends Row {
  depth: number;
  hasChildren: boolean;
}

export function List({ setId, itemIds, pinnedIds, onGoTo, onDeleteRequested, onMembersChanged }: ListProps) {
  const pinnedSet = useMemo(() => new Set(pinnedIds ?? []), [pinnedIds]);
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({
    key: "date_added",
    ascending: false,
  });
  const [menu, setMenu] = useState<{ anchor: MenuAnchor; item: Item } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  /** Which top-level rows are showing their children. */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const body = useRef<HTMLDivElement>(null);
  /** Where the last pick landed, so ⇧-click knows what "to here" means. */
  const anchor = useRef<string | null>(null);

  const chosen = useSelection(() => new Set(selection.ids()));
  const selfDevice = useSelfDevice();

  useEffect(() => {
    selection.setScope(itemIds);
  }, [itemIds]);

  const rowFor = useCallback(
    (item: Item, order: number | null): Row => {
      const uri = item.resources[0]?.uri;
      return {
        item,
        order,
        device: uri ? deviceOf(uri) : "—",
        kind: uri ? deviceKindOf(uri, selfDevice) : null,
        place: pool.isPlace(item.id),
        pinned: pinnedSet.has(item.id),
        type: (item.data.type?.value as string | undefined) ?? null,
      };
    },
    [selfDevice, pinnedSet],
  );

  const { rows, childrenByParent } = usePool(() => {
    const topLevelIds = pool.topLevelAmong(itemIds);
    const memberIds = new Set(itemIds);

    const rows: Row[] = topLevelIds.flatMap((id) => {
      const item = pool.getItem(id);
      if (!item) return [];
      const arrow = pool.findConnection(id, setId, MEMBER_OF_LABEL_ID);
      return [rowFor(item, arrow?.order ?? null)];
    });

    const childrenByParent = new Map<string, Row[]>();
    for (const id of topLevelIds) {
      const children = pool
        .childrenOf(id)
        .filter((connection) => memberIds.has(connection.target))
        .flatMap((connection) => {
          const child = pool.getItem(connection.target);
          return child ? [rowFor(child, null)] : [];
        });
      if (children.length > 0) childrenByParent.set(id, children);
    }

    return { rows, childrenByParent };
  });

  const manual = rows.some((row) => row.order !== null);

  const sorted = useMemo(() => {
    const copy = [...rows];
    if (manual) {
      // Rows the user has placed come first, in their order; anything
      // never touched keeps the intrinsic sort behind them.
      copy.sort((a, b) => {
        if (a.order !== null && b.order !== null) return a.order - b.order;
        if (a.order !== null) return -1;
        if (b.order !== null) return 1;
        return a.item.date_added.localeCompare(b.item.date_added);
      });
      return copy;
    }

    const direction = sort.ascending ? 1 : -1;
    copy.sort((a, b) => {
      if (sort.key === "name") return captionOf(a.item).localeCompare(captionOf(b.item)) * direction;
      if (sort.key === "device") return a.device.localeCompare(b.device) * direction;
      // `date_added` is immutable and full-precision (it absorbed the old
      // `created_at`), so it alone both pages the timeline and breaks
      // same-day ties in the order items were actually made.
      return a.item.date_added.localeCompare(b.item.date_added) * direction;
    });
    return copy;
  }, [rows, manual, sort]);

  // The single source of truth for rendering and every interaction: the
  // top-level sort, with each expanded parent's children spliced in right
  // behind it.
  const visible = useMemo(() => {
    const result: VisibleRow[] = [];
    for (const row of sorted) {
      const children = childrenByParent.get(row.item.id);
      const hasChildren = (children?.length ?? 0) > 0;
      result.push({ ...row, depth: 0, hasChildren });
      if (hasChildren && expanded.has(row.item.id)) {
        for (const child of children!) {
          result.push({ ...child, depth: 1, hasChildren: false });
        }
      }
    }
    return result;
  }, [sorted, childrenByParent, expanded]);

  const toggleSort = useCallback((key: SortKey) => {
    setSort((current) =>
      current.key === key ? { key, ascending: !current.ascending } : { key, ascending: true },
    );
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** Which row index the pointer is currently over. */
  const indexAt = useCallback((clientY: number): number => {
    const container = body.current;
    if (!container) return 0;
    const elements = [...container.querySelectorAll<HTMLElement>(".row")];
    for (const [index, element] of elements.entries()) {
      const box = element.getBoundingClientRect();
      if (clientY < box.top + box.height / 2) return index;
    }
    return elements.length;
  }, []);

  const startReorder = useCallback(
    (event: React.PointerEvent, item: Item) => {
      event.preventDefault();
      setDragging(item.id);

      const onMove = (move: PointerEvent) => {
        move.preventDefault();
      };
      const onUp = (up: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setDragging(null);

        const target = indexAt(up.clientY);
        const from = visible.findIndex((row) => row.item.id === item.id);
        if (from === -1 || target === from || target === from + 1) return;
        // Dropping below its own position lands one slot higher once the
        // row is lifted out.
        void apply(changes.reorder(item, setId, target > from ? target - 1 : target));
      };

      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
    },
    [indexAt, setId, visible],
  );

  /**
   * What a click on a row means. ⇧ takes everything between the last
   * pick and this one — the whole reason a list is easier to select in
   * than a canvas — ⌘ toggles one, and a plain click takes just this
   * one. Opening is the double click.
   */
  const pick = useCallback(
    (event: React.MouseEvent | React.KeyboardEvent, item: Item): void => {
      if (event.shiftKey) {
        const from = visible.findIndex((row) => row.item.id === anchor.current);
        const to = visible.findIndex((row) => row.item.id === item.id);
        if (from !== -1 && to !== -1) {
          const [start, end] = from < to ? [from, to] : [to, from];
          selection.add(visible.slice(start, end + 1).map((row) => row.item.id));
        } else {
          selection.add([item.id]);
        }
        anchor.current = item.id;
        return;
      }
      if (event.metaKey || event.ctrlKey) {
        selection.toggle(item.id);
        anchor.current = item.id;
        return;
      }
      selection.replace([item.id]);
      anchor.current = item.id;
    },
    [visible],
  );

  // ↑ / ↓ and W / S walk the rows the way a click already can — each
  // step replaces the pick with the row beside the last one and carries
  // focus with it, so Space/Enter on the row still land where the
  // arrows left off. Left/right belong to the trail (useArrowNav), not
  // to a list with only one column to move across.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (isEditing(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (visible.length === 0) return;

      const key = event.key.toLowerCase();
      const down = event.key === "ArrowDown" || key === "s";
      const up = event.key === "ArrowUp" || key === "w";
      if (!down && !up) return;
      event.preventDefault();

      const current = anchor.current
        ? visible.findIndex((row) => row.item.id === anchor.current)
        : -1;
      const next =
        current === -1
          ? 0
          : Math.min(Math.max(current + (down ? 1 : -1), 0), visible.length - 1);
      const row = visible[next];
      if (!row) return;

      selection.replace([row.item.id]);
      anchor.current = row.item.id;

      const element = body.current?.querySelectorAll<HTMLElement>(".row")[next];
      element?.focus();
      element?.scrollIntoView({ block: "nearest" });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible]);

  return (
    <div className="list">
      <div className="list-head">
        <span className="col-handle" />
        <span className="col-thumb" />
        <button className="col-name" onClick={() => toggleSort("name")} type="button">
          name{sortMark(sort, "name", manual)}
        </button>
        <button className="col-date" onClick={() => toggleSort("date_added")} type="button">
          added{sortMark(sort, "date_added", manual)}
        </button>
        <span className="col-type">type</span>
        <button className="col-device" onClick={() => toggleSort("device")} type="button">
          device{sortMark(sort, "device", manual)}
        </button>
      </div>

      {manual && (
        <div className="list-manual">
          <span className="chip">
            sorted manually
            <button
              aria-label="sort by date again"
              onClick={() => void apply(changes.clearOrder(setId))}
              type="button"
            >
              ✕
            </button>
          </span>
        </div>
      )}

      <div className="list-body" ref={body}>
        {visible.map((row) => (
          <div
            aria-selected={chosen.has(row.item.id)}
            className={[
              "row",
              row.depth > 0 ? "is-child" : "",
              dragging === row.item.id ? "is-dragging" : "",
              chosen.has(row.item.id) ? "is-chosen" : "",
            ]
              .join(" ")
              .replace(/\s+/g, " ")
              .trim()}
            data-item={row.item.id}
            key={row.item.id}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu({ anchor: { x: event.clientX, y: event.clientY }, item: row.item });
            }}
            // One click chooses, two open it — and the keyboard keeps
            // both: space chooses where the pointer would click, Enter
            // opens where it would double click.
            onClick={(event) => pick(event, row.item)}
            onDoubleClick={() => onGoTo(row.item)}
            onKeyDown={(event) => {
              if (event.key === " ") {
                event.preventDefault();
                pick(event, row.item);
              } else if (event.key === "Enter") {
                event.preventDefault();
                onGoTo(row.item);
              }
            }}
            role="button"
            tabIndex={0}
          >
            {row.depth === 0 ? (
              <button
                aria-label="reorder"
                className="col-handle"
                // The handle is inside the row; without this, grabbing it
                // would also navigate away from the list you are sorting.
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => startReorder(event, row.item)}
                type="button"
              >
                ⠿
              </button>
            ) : (
              // A child's order comes from Spotify, not the hand — no
              // handle to grab, just the space it would have taken.
              <span className="col-handle" />
            )}
            <span className="col-thumb">
              <Thumb item={row.item} />
              {row.place && <span className="row-place">{PLACE_GLYPH}</span>}
              {row.pinned && (
                <span className="row-pinned" title="pinned here by hand — this Space's rule wouldn't match it">
                  {PIN_GLYPH}
                </span>
              )}
            </span>
            <span className="col-name">
              {row.hasChildren && (
                <button
                  aria-label={expanded.has(row.item.id) ? "collapse" : "expand"}
                  className="row-disclosure"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleExpanded(row.item.id);
                  }}
                  type="button"
                >
                  {expanded.has(row.item.id) ? "▾" : "▸"}
                </button>
              )}
              <span className="col-name-text">{captionOf(row.item) || "unnamed"}</span>
            </span>
            <span className="col-date">{row.item.date_added.slice(0, 10)}</span>
            <span className="col-type">{row.type ?? "—"}</span>
            <span className="col-device">{row.kind ? <DeviceIcon kind={row.kind} /> : "—"}</span>
          </div>
        ))}

        {visible.length === 0 && <p className="list-empty">nothing yet</p>}
      </div>

      {menu && (
        <ContextMenu
          anchor={menu.anchor}
          items={itemMenu(menu.item, { onGoTo, onRemoved: onMembersChanged, onRequestDelete: onDeleteRequested, setId })}
          onDismiss={() => setMenu(null)}
        />
      )}
    </div>
  );
}

function sortMark(
  sort: { key: SortKey; ascending: boolean },
  key: SortKey,
  manual: boolean,
): string {
  if (manual || sort.key !== key) return "";
  return sort.ascending ? " ↑" : " ↓";
}

function Thumb({ item }: { item: Item }) {
  const image = usePool(() => nodeImageUrl(item));
  return image ? <img alt="" src={image} /> : <span className="thumb-blank" />;
}
