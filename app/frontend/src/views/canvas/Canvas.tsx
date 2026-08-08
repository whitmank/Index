// Authored by Karter Whitman using Claude Opus 4.8
// The canvas: a set's members as spatial nodes (PRODUCT-SPEC §3.4).
//
// Pointing at a node picks it out, and looking away puts it down — the
// canvas is a place where things sit still and the pointer is already
// the thing you aim with, so making you click to say "this one" was a
// step that bought nothing. Clicking still goes, and a deliberate
// selection silences the pointer until it is escaped.
// Positions come from the arrows into the set and go back the same way —
// dropping a node commits a `place` change, so where you put something is
// recorded as an opinion about *this* set, not a property of the item.
//
// The simulation in physics.ts owns motion and knows nothing about the
// DOM; this file owns display and gestures. Node positions are written
// straight to element transforms on each tick rather than through React
// state — sixty renders a second of the whole member list is exactly the
// work that seam exists to avoid.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Item } from "@index/database/types";
import { apply, changes } from "../../changes/index.js";
import { ContextMenu, type MenuAnchor } from "../../components/ContextMenu.tsx";
import { itemMenu } from "../../components/itemActions.ts";
import { captionOf, nodeImageUrl } from "../../lib/derive.js";
import { VIEW_GLYPH, viewKindOf } from "../../lib/sets.js";
import { pool, selection, usePool, useSelection } from "../../store/index.js";
import {
  createSimulation,
  NODE_RADIUS,
  previewBox,
  seedPositions,
  type SimNode,
  type Simulation,
} from "./physics.js";

/** How far the pointer must travel before a press becomes a drag rather
 * than a click. Below this, a shaky hand still opens the item. */
const DRAG_THRESHOLD = 4;

export interface CanvasProps {
  /** The set being viewed — the arrows that carry position point at it. */
  setId: string;
  itemIds: string[];
  /** The day this canvas is a page of, if it is one; new items land here. */
  date?: string;
  /** Whether this canvas is the one being looked at. The timeline mounts
   * its neighbours too, and a page you are only peeking at does not get
   * to say what ⌘A means. */
  active?: boolean;
  /** The shell's one navigation primitive. `isNew` is true when this
   * gesture created the item it hands over. */
  onGoTo: (item: Item, isNew?: boolean) => void;
  /** Someone left the set; who is in it has to be read again, since
   * membership is the union of a query and the arrows, and only the
   * backend knows the first half. */
  onMembersChanged?: () => void;
}

/** A band smaller than this is a click on the background, not a sweep. */
const MARQUEE_THRESHOLD = 6;

export function Canvas({
  setId,
  itemIds,
  date,
  active = true,
  onGoTo,
  onMembersChanged,
}: CanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const elements = useRef(new Map<string, HTMLElement>());
  const simulation = useRef<Simulation | null>(null);
  const [menu, setMenu] = useState<{ anchor: MenuAnchor; item: Item } | null>(null);
  /** The live rubber band, in client coordinates, while one is being drawn. */
  const [band, setBand] = useState<Band | null>(null);
  /** True while a gesture owns the pointer. Passing over a node on the
   * way to somewhere else is not pointing at it. */
  const gesturing = useRef(false);

  const items = usePool(() =>
    itemIds.flatMap((id) => {
      const item = pool.getItem(id);
      return item ? [item] : [];
    }),
  );

  // Where the set says each member sits. Read on every render so an
  // undo that restores a position is picked up like any other change.
  const placed = usePool(() => {
    const positions = new Map<string, { x: number; y: number }>();
    for (const arrow of pool.arrowsInto(setId)) {
      if (arrow.position) positions.set(arrow.source, arrow.position);
    }
    return positions;
  });

  // The identity of the member list, so the simulation is rebuilt when
  // *which* items are shown changes — not when one of them is renamed.
  const membership = items.map((item) => item.id).join(" ");

  // What ⌘A means while you are looking at this canvas. A page you are
  // only peeking at from the timeline does not get to answer.
  useEffect(() => {
    if (active) selection.setScope(itemIds);
  }, [active, itemIds]);

  const chosen = useSelection(() => new Set(selection.ids()));

  const paint = useCallback(() => {
    const simulated = simulation.current?.nodes ?? [];
    for (const node of simulated) {
      const element = elements.current.get(node.id);
      if (element) element.style.transform = `translate(${node.x}px, ${node.y}px)`;
    }
  }, []);

  useLayoutEffect(() => {
    const box = container.current;
    if (!box) return;

    const viewport = { width: box.clientWidth, height: box.clientHeight };
    const nodes: SimNode[] = membership
      .split(" ")
      .filter(Boolean)
      .map((id) => ({ id, ox: 0, oy: 0, rx: 0, ry: 0, x: 0, y: 0, vx: 0, vy: 0 }));

    seedPositions(nodes, placed, viewport);
    const sim = createSimulation(nodes, viewport, paint);
    simulation.current = sim;
    paint();

    const observer = new ResizeObserver(() => {
      sim.setViewport({ width: box.clientWidth, height: box.clientHeight });
    });
    observer.observe(box);

    return () => {
      observer.disconnect();
      sim.stop();
      simulation.current = null;
    };
    // `placed` is read once, at seed time; keeping up with it afterwards
    // is `syncPlacements`' job below, which can tell a write this canvas
    // made from one it didn't.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membership, paint]);

  // An undo, a redo, or another view moving something: the set's opinion
  // changed without this canvas doing it, so the nodes follow.
  useEffect(() => {
    simulation.current?.syncPlacements(placed);
  }, [placed]);

  const startDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, item: Item) => {
      if (event.button !== 0) return;
      const box = container.current;
      const sim = simulation.current;
      if (!box || !sim) return;

      // Held down, the click means "pick this out" instead of "go here".
      // Plain clicking still goes — the one promise the whole shell makes
      // about a click is not worth a selection feature.
      const picking = event.metaKey || event.ctrlKey || event.shiftKey;
      gesturing.current = true;
      const bounds = box.getBoundingClientRect();
      const origin = { x: event.clientX, y: event.clientY };
      let moved = false;

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Capture is a convenience, not a requirement — the move and up
        // listeners are on the window. A synthetic pointer has nothing to
        // capture, and that must not stop the gesture.
      }
      sim.hold(item.id);

      const onMove = (move: PointerEvent) => {
        const travelled = Math.hypot(move.clientX - origin.x, move.clientY - origin.y);
        if (travelled > DRAG_THRESHOLD) moved = true;
        if (moved) sim.dragTo(item.id, move.clientX - bounds.left, move.clientY - bounds.top);
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        sim.hold(null);
        gesturing.current = false;

        const node = sim.nodes.find((candidate) => candidate.id === item.id);
        if (!moved) {
          if (picking) selection.toggle(item.id);
          else onGoTo(item);
          return;
        }
        if (node) void apply(changes.place(item, setId, { x: node.ox, y: node.oy }));
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [onGoTo, setId],
  );

  /**
   * A sweep across empty space: the rubber band, and everything whose
   * node it touches. Started on the background, so it can never be
   * confused with dragging a node — the node's own handler takes those
   * presses first and this one never sees them.
   *
   * Hit-testing reads the drawn elements rather than the simulation's
   * coordinates: the nodes are painted straight to transforms outside
   * React, and where a node *is drawn* is the only honest answer to what
   * the user just swept over.
   */
  const startMarquee = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.target !== event.currentTarget) return;
    const box = container.current;
    if (!box) return;

    const extending = event.metaKey || event.ctrlKey || event.shiftKey;
    gesturing.current = true;
    const origin = { x: event.clientX, y: event.clientY };
    let swept = false;

    const onMove = (move: PointerEvent) => {
      const next = bandBetween(origin, { x: move.clientX, y: move.clientY });
      if (next.width > MARQUEE_THRESHOLD || next.height > MARQUEE_THRESHOLD) swept = true;
      if (swept) setBand(next);
    };

    const onUp = (up: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setBand(null);
      gesturing.current = false;

      // A press on the background that never became a sweep is how you
      // put the selection down.
      if (!swept) {
        selection.clear();
        return;
      }

      const final = bandBetween(origin, { x: up.clientX, y: up.clientY });
      const caught = [...elements.current.entries()]
        .filter(([, element]) => overlaps(final, element.getBoundingClientRect()))
        .map(([id]) => id);

      if (extending) selection.add(caught);
      else selection.replace(caught);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  /**
   * Pointing at a node picks it out, and looking away puts it down. The
   * lightest way to say "this one": no click, no modifier, nothing to
   * learn, and nothing left behind. The selection store decides whether
   * the pointer still has a voice — once something is picked
   * deliberately it does not, or crossing the canvas would undo the
   * marquee you just drew.
   */
  const point = useCallback(
    (id: string) => {
      if (!active || gesturing.current) return;
      selection.hover(id);
    },
    [active],
  );

  const unpoint = useCallback((id: string) => {
    // A drag carries the pointer off the node it is holding; that is not
    // looking away from it.
    if (gesturing.current) return;
    selection.unhover(id);
  }, []);

  const createHere = useCallback(() => {
    const item = changes.blankItem(date);
    void apply(changes.createItem(item)).then((ok) => {
      if (ok) onGoTo(item, true);
    });
  }, [date, onGoTo]);

  // OS file drop: one item per file, named from the basename, on this
  // page's date. Nothing is copied — intake records a pointer.
  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const paths = [...event.dataTransfer.files].map((file) =>
        window.index.intake.pathForFile(file),
      );
      if (paths.length === 0) return;

      void window.index.intake.pathsToResources(paths).then((answer) => {
        if ("err" in answer) return;
        for (const resource of answer.ok.resources) {
          const item = {
            ...changes.blankItem(date),
            name: resource.name,
            resources: [resource],
          };
          void apply(changes.createItem(item));
        }
      });
    },
    [date],
  );

  return (
    <div
      className="canvas"
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      onPointerDown={startMarquee}
      ref={container}
    >
      {items.map((item) => (
        <Node
          chosen={chosen.has(item.id)}
          item={item}
          key={item.id}
          onContextMenu={(anchor) => setMenu({ anchor, item })}
          onPointerDown={(event) => startDrag(event, item)}
          onPointerEnter={() => point(item.id)}
          onPointerLeave={() => unpoint(item.id)}
          register={(element) => {
            if (element) elements.current.set(item.id, element);
            else elements.current.delete(item.id);
          }}
          onBox={(width, height) => simulation.current?.setBox(item.id, width, height)}
        />
      ))}

      {items.length === 0 && <p className="canvas-empty">nothing yet</p>}

      {band && (
        <div
          className="marquee"
          style={{ left: band.x, top: band.y, width: band.width, height: band.height }}
        />
      )}

      <button className="canvas-add" onClick={createHere} title="New item (⌘N)" type="button">
        +
      </button>

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

/** A rubber band, in client coordinates — the same frame element rects
 * come back in, so hit-testing needs no conversion. */
interface Band {
  x: number;
  y: number;
  width: number;
  height: number;
}

function bandBetween(a: { x: number; y: number }, b: { x: number; y: number }): Band {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/**
 * Whether the band touches the circle drawn at this node. A node element
 * is a zero-size point at the node's centre — the visible shape is a
 * child, drawn around it — so the point is grown back to the circle the
 * user actually swept over, rather than testing a rectangle that isn't
 * there.
 */
function overlaps(band: Band, at: DOMRect): boolean {
  return (
    band.x <= at.left + NODE_RADIUS &&
    band.x + band.width >= at.left - NODE_RADIUS &&
    band.y <= at.top + NODE_RADIUS &&
    band.y + band.height >= at.top - NODE_RADIUS
  );
}

function Node({
  chosen,
  item,
  onBox,
  onContextMenu,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
  register,
}: {
  chosen: boolean;
  item: Item;
  onBox: (width: number, height: number) => void;
  onContextMenu: (anchor: MenuAnchor) => void;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  register: (element: HTMLElement | null) => void;
}) {
  const image = usePool(() => nodeImageUrl(item));
  const caption = captionOf(item);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);

  // A place is somewhere clicking takes you *into*. It has to look
  // different from a thing, or the same gesture is a coin toss.
  const place = usePool(() => (pool.isPlace(item.id) ? viewKindOf(item) : null));

  // The expanded box is only knowable once the image has told us its
  // aspect; until then the node keeps the radius as its margin.
  useEffect(() => {
    if (!image) {
      setBox(null);
      return;
    }
    let cancelled = false;
    const probe = new Image();
    probe.onload = () => {
      if (cancelled) return;
      const next = previewBox(probe.naturalWidth, probe.naturalHeight);
      setBox(next);
      onBox(next.width, next.height);
    };
    probe.src = image;
    return () => {
      cancelled = true;
    };
  }, [image, onBox]);

  const style = useMemo(
    () =>
      ({
        "--radius": `${NODE_RADIUS}px`,
        ...(box ? { "--hw": `${box.width}px`, "--hh": `${box.height}px` } : {}),
      }) as React.CSSProperties,
    [box],
  );

  return (
    <div
      aria-selected={chosen}
      className={[box ? "node can-grow" : "node", place ? "is-place" : "", chosen ? "is-chosen" : ""]
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()}
      data-item={item.id}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu({ x: event.clientX, y: event.clientY });
      }}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      ref={register}
      style={style}
      title={place ? `${caption || "untitled"} — a ${place}, click to go in` : undefined}
    >
      <div className="node-shape">
        {image ? <img alt="" draggable={false} src={image} /> : null}
      </div>
      {/* Outside the shape: it clips to a circle, and the mark rides the
          edge rather than sitting under it. */}
      {place && <span className="node-place">{VIEW_GLYPH[place]}</span>}
      {caption && <span className="node-caption">{caption}</span>}
    </div>
  );
}
