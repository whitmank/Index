// Authored by Karter Whitman using Claude Opus 4.8
// The list view: a set's members as rows, sortable by their intrinsic
// fields (PRODUCT-SPEC §3.4).
//
// A list with no manual order sorts by what the items *are*, the way a
// canvas with no positions lets physics settle the nodes. Dragging a row
// is the moment an opinion appears: `order` materialises on the arrows to
// this set, and the chip that appears says so — with an ✕ that clears
// every one of them in a single change.
import { useCallback, useMemo, useRef, useState } from "react";
import type { Item, ViewKind } from "@index/database/types";
import { apply, changes } from "../../changes/index.js";
import { ContextMenu, type MenuAnchor } from "../../components/ContextMenu.tsx";
import { itemMenu } from "../../components/itemActions.ts";
import { captionOf, deviceOf, nodeImageUrl } from "../../lib/derive.js";
import { VIEW_GLYPH, viewKindOf } from "../../lib/sets.js";
import { pool, usePool } from "../../store/index.js";

type SortKey = "name" | "date" | "device";

export interface ListProps {
  setId: string;
  itemIds: string[];
  /** The shell's one navigation primitive. */
  onGoTo: (item: Item, isNew?: boolean) => void;
}

interface Row {
  item: Item;
  tags: string[];
  device: string;
  order: number | null;
  /** The view kind when this row is a place, null when it is a thing. */
  place: ViewKind | null;
}

export function List({ setId, itemIds, onGoTo }: ListProps) {
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({
    key: "date",
    ascending: false,
  });
  const [menu, setMenu] = useState<{ anchor: MenuAnchor; item: Item } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);

  const rows = usePool<Row[]>(() =>
    itemIds.flatMap((id) => {
      const item = pool.getItem(id);
      if (!item) return [];
      const arrow = pool.findConnection(id, setId, null);
      return [
        {
          item,
          order: arrow?.order ?? null,
          device: item.resources[0] ? deviceOf(item.resources[0].uri) : "—",
          place: pool.isPlace(id) ? viewKindOf(item) : null,
          // Belonging to the set you are already looking at is not a fact
          // about the item — every row would carry it. Only the other
          // arrows say anything here.
          tags: pool
            .outboundFrom(id)
            .filter((connection) => connection.label === null && connection.target !== setId)
            .flatMap((connection) => {
              const target = pool.getItem(connection.target);
              return target ? [captionOf(target)] : [];
            }),
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
      return a.item.date.localeCompare(b.item.date) * direction;
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
        <span className="col-tags">tags</span>
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
            className={dragging === row.item.id ? "row is-dragging" : "row"}
            data-item={row.item.id}
            key={row.item.id}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu({ anchor: { x: event.clientX, y: event.clientY }, item: row.item });
            }}
            // One click, the same as everywhere else. A row is not a
            // different kind of object because it is drawn as a line.
            onClick={() => onGoTo(row.item)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onGoTo(row.item);
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
              {row.place && <span className="row-place">{VIEW_GLYPH[row.place]}</span>}
            </span>
            <span className="col-name">{captionOf(row.item) || "unnamed"}</span>
            <span className="col-date">{row.item.date}</span>
            <span className="col-tags">{row.tags.join(", ")}</span>
            <span className="col-device">{row.device}</span>
          </div>
        ))}

        {sorted.length === 0 && <p className="list-empty">nothing yet</p>}
      </div>

      {menu && (
        <ContextMenu
          anchor={menu.anchor}
          items={itemMenu(menu.item, { onGoTo })}
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
