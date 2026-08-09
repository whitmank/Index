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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Item } from "@index/database/types";
import { apply, changes } from "../../changes/index.js";
import { ContextMenu, type MenuAnchor } from "../../components/ContextMenu.tsx";
import { DeviceIcon } from "../../components/DeviceIcon.tsx";
import { itemMenu } from "../../components/itemActions.ts";
import { captionOf, deviceKindOf, deviceOf, type DeviceKind, nodeImageUrl } from "../../lib/derive.js";
import { PLACE_GLYPH } from "../../lib/sets.js";
import { pool, selection, usePool, useSelection, useSelfDevice } from "../../store/index.js";

type SortKey = "name" | "date" | "device";

export interface ListProps {
  setId: string;
  itemIds: string[];
  /** The shell's one navigation primitive. */
  onGoTo: (item: Item, isNew?: boolean) => void;
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
}

export function List({ setId, itemIds, onGoTo, onMembersChanged }: ListProps) {
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({
    key: "date",
    ascending: false,
  });
  const [menu, setMenu] = useState<{ anchor: MenuAnchor; item: Item } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);
  /** Where the last pick landed, so ⇧-click knows what "to here" means. */
  const anchor = useRef<string | null>(null);

  const chosen = useSelection(() => new Set(selection.ids()));
  const selfDevice = useSelfDevice();

  useEffect(() => {
    selection.setScope(itemIds);
  }, [itemIds]);

  const rows = usePool<Row[]>(() =>
    itemIds.flatMap((id) => {
      const item = pool.getItem(id);
      if (!item) return [];
      const arrow = pool.findConnection(id, setId, null);
      const uri = item.resources[0]?.uri;
      return [
        {
          item,
          order: arrow?.order ?? null,
          device: uri ? deviceOf(uri) : "—",
          kind: uri ? deviceKindOf(uri, selfDevice) : null,
          place: pool.isPlace(id),
          type: item.type,
        },
      ];
    }),
  );

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
        return a.item.created_at.localeCompare(b.item.created_at);
      });
      return copy;
    }

    const direction = sort.ascending ? 1 : -1;
    copy.sort((a, b) => {
      if (sort.key === "name") return captionOf(a.item).localeCompare(captionOf(b.item)) * direction;
      if (sort.key === "device") return a.device.localeCompare(b.device) * direction;
      // `date` is the journal day (PRODUCT-SPEC §1.1) — several items
      // land on the same one, and a plain stable sort would then leave
      // them in whatever order they arrived from the backend, not the
      // order they were made in. `created_at` breaks that tie, same as
      // the manual-order branch above already does.
      const day = a.item.date.localeCompare(b.item.date);
      if (day !== 0) return day * direction;
      return a.item.created_at.localeCompare(b.item.created_at) * direction;
    });
    return copy;
  }, [rows, manual, sort]);

  const toggleSort = useCallback((key: SortKey) => {
    setSort((current) =>
      current.key === key ? { key, ascending: !current.ascending } : { key, ascending: true },
    );
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
        const from = sorted.findIndex((row) => row.item.id === item.id);
        if (from === -1 || target === from || target === from + 1) return;
        // Dropping below its own position lands one slot higher once the
        // row is lifted out.
        void apply(changes.reorder(item, setId, target > from ? target - 1 : target));
      };

      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
    },
    [indexAt, setId, sorted],
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
        const from = sorted.findIndex((row) => row.item.id === anchor.current);
        const to = sorted.findIndex((row) => row.item.id === item.id);
        if (from !== -1 && to !== -1) {
          const [start, end] = from < to ? [from, to] : [to, from];
          selection.add(sorted.slice(start, end + 1).map((row) => row.item.id));
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
    [sorted],
  );

  return (
    <div className="list">
      <div className="list-head">
        <span className="col-handle" />
        <span className="col-thumb" />
        <button className="col-name" onClick={() => toggleSort("name")} type="button">
          name{sortMark(sort, "name", manual)}
        </button>
        <button className="col-date" onClick={() => toggleSort("date")} type="button">
          date{sortMark(sort, "date", manual)}
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
        {sorted.map((row) => (
          <div
            aria-selected={chosen.has(row.item.id)}
            className={[
              "row",
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
            <span className="col-thumb">
              <Thumb item={row.item} />
              {row.place && <span className="row-place">{PLACE_GLYPH}</span>}
            </span>
            <span className="col-name">{captionOf(row.item) || "unnamed"}</span>
            <span className="col-date">{row.item.date}</span>
            <span className="col-type">{row.type ?? "—"}</span>
            <span className="col-device">{row.kind ? <DeviceIcon kind={row.kind} /> : "—"}</span>
          </div>
        ))}

        {sorted.length === 0 && <p className="list-empty">nothing yet</p>}
      </div>

      {menu && (
        <ContextMenu
          anchor={menu.anchor}
          items={itemMenu(menu.item, { onGoTo, onRemoved: onMembersChanged, setId })}
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
