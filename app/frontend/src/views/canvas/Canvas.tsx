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
import { createItemsFromPaths } from "../../lib/intake.js";
import { PLACE_GLYPH } from "../../lib/sets.js";
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

/** How long a right-button press/release can take and still count as a
 * click rather than the start of an edge. Above this, holding still
 * (never mind dragging) means the user is arming a connection, not
 * asking for the menu. */
const RAPID_CLICK_MS = 300;

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
  const edgeElements = useRef(new Map<string, { el: SVGLineElement; source: string; target: string }>());
  const simulation = useRef<Simulation | null>(null);
  const [menu, setMenu] = useState<{ anchor: MenuAnchor; item: Item } | null>(null);
  /** The live rubber band, in client coordinates, while one is being drawn. */
  const [band, setBand] = useState<Band | null>(null);
  /** The live edge preview, container-relative, while a right-button press
   * is dragging one out of a node. */
  const [pendingEdge, setPendingEdge] = useState<PendingEdge | null>(null);
  /** The node a pending edge is currently over — the one release would
   * join to. Separate from `pendingEdge` so the line and the ring it
   * lands on can update independently. */
  const [edgeTarget, setEdgeTarget] = useState<string | null>(null);
  /** True while a gesture owns the pointer. Passing over a node on the
   * way to somewhere else is not pointing at it. */
  const gesturing = useRef(false);
  /** True from a right-button pointerdown on a node until its matching
   * pointerup: the window during which the *pointer* gesture, not the
   * browser's own `contextmenu` event, gets to decide whether the menu
   * opens. Trackpad taps and Ctrl-click never set it, so they still fall
   * through to the old behaviour. */
  const rightGesturing = useRef(false);

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

  // The relations between two members of this canvas — what gets drawn
  // as an edge. Distinct from `placed`: that reads the arrow anchoring a
  // member to *this* set, this reads arrows members hold *between each
  // other*, wherever both ends happen to be visible here.
  const edges = usePool(() => pool.connectionsAmong(itemIds));

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
    const positions = new Map<string, { x: number; y: number }>();
    for (const node of simulated) {
      const element = elements.current.get(node.id);
      if (element) element.style.transform = `translate(${node.x}px, ${node.y}px)`;
      positions.set(node.id, { x: node.x, y: node.y });
    }
    // Edges ride the same tick, straight to attributes for the same
    // reason node positions bypass React — a line an undo or a drag
    // moves has to follow at 60fps, not at render speed.
    for (const edge of edgeElements.current.values()) {
      const from = positions.get(edge.source);
      const to = positions.get(edge.target);
      if (!from || !to) continue;
      edge.el.setAttribute("x1", String(from.x));
      edge.el.setAttribute("y1", String(from.y));
      edge.el.setAttribute("x2", String(to.x));
      edge.el.setAttribute("y2", String(to.y));
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
   * A right-button press on a node arms an edge rather than opening the
   * menu outright — the same button now has to mean two things, and only
   * the up-stroke can tell them apart. Held and released quickly, without
   * travelling, it is the click the context menu has always answered to.
   * Held and dragged onto another node, it draws a connection between the
   * two — the same kind `connectionsAmong` already knows how to render as
   * a canvas edge (PRODUCT-SPEC §3.4). Dragged and released anywhere
   * else — empty canvas, back on the source, or just held past the rapid
   * window without moving — the gesture is simply let go.
   */
  const startEdge = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, item: Item) => {
      if (event.button !== 2) return;
      event.preventDefault();
      const box = container.current;
      const sim = simulation.current;
      if (!box || !sim) return;

      gesturing.current = true;
      rightGesturing.current = true;
      const bounds = box.getBoundingClientRect();
      const origin = { x: event.clientX, y: event.clientY };
      const startedAt = Date.now();
      let moved = false;

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // As in startDrag: capture is a convenience the window listeners
        // don't depend on.
      }

      const place = (clientX: number, clientY: number) => {
        const from = sim.nodes.find((candidate) => candidate.id === item.id);
        setPendingEdge({
          x1: from ? from.x : clientX - bounds.left,
          y1: from ? from.y : clientY - bounds.top,
          x2: clientX - bounds.left,
          y2: clientY - bounds.top,
        });
      };
      place(origin.x, origin.y);

      const onMove = (move: PointerEvent) => {
        const travelled = Math.hypot(move.clientX - origin.x, move.clientY - origin.y);
        if (travelled > DRAG_THRESHOLD) moved = true;
        place(move.clientX, move.clientY);
        setEdgeTarget(
          moved ? (nodeUnder(elements.current, { x: move.clientX, y: move.clientY }, item.id) ?? null) : null,
        );
      };

      const onUp = (up: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        gesturing.current = false;
        setPendingEdge(null);
        setEdgeTarget(null);

        const rapid = !moved && Date.now() - startedAt < RAPID_CLICK_MS;
        if (rapid) {
          setMenu({ anchor: { x: up.clientX, y: up.clientY }, item });
        } else if (moved) {
          const targetId = nodeUnder(elements.current, { x: up.clientX, y: up.clientY }, item.id);
          const target = targetId ? pool.getItem(targetId) : undefined;
          if (target) void apply(changes.tag(item, target));
        }

        // The browser's own `contextmenu` event is still to come — it
        // follows pointerup in the same release, before any timer fires —
        // so the flag has to survive this turn for that handler to see it
        // and stand down. Cleared on the next one instead of here.
        setTimeout(() => {
          rightGesturing.current = false;
        }, 0);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [],
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
  // page's date. Nothing is copied — intake records a pointer. Claiming
  // the drop here (preventDefault, no stopPropagation) is what tells the
  // shell-level fallback (App.tsx) this one is already handled.
  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const paths = [...event.dataTransfer.files].map((file) =>
        window.index.intake.pathForFile(file),
      );
      void createItemsFromPaths(paths, date).then((created) => {
        const last = created[created.length - 1];
        if (last) onGoTo(last, true);
      });
    },
    [date, onGoTo],
  );

  return (
    <div
      className="canvas"
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      onPointerDown={startMarquee}
      ref={container}
    >
      <svg aria-hidden="true" className="canvas-edges">
        {edges.map((edge) => (
          <line
            className="canvas-edge"
            key={edge.id}
            ref={(el) => {
              if (el) edgeElements.current.set(edge.id, { el, source: edge.source, target: edge.target });
              else edgeElements.current.delete(edge.id);
            }}
          />
        ))}
        {pendingEdge && (
          <line
            className="canvas-edge canvas-edge-pending"
            x1={pendingEdge.x1}
            y1={pendingEdge.y1}
            x2={pendingEdge.x2}
            y2={pendingEdge.y2}
          />
        )}
      </svg>

      {items.map((item) => (
        <Node
          armed={edgeTarget === item.id}
          chosen={chosen.has(item.id)}
          item={item}
          key={item.id}
          onContextMenu={(anchor) => {
            // A real right-button drag already answered this through the
            // pointer gesture above; this native event is only left to
            // handle the paths that never send one, like a trackpad tap
            // or Ctrl-click.
            if (rightGesturing.current) return;
            setMenu({ anchor, item });
          }}
          onPointerDown={(event) => {
            if (event.button === 2) startEdge(event, item);
            else startDrag(event, item);
          }}
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

/** The edge being dragged out of a node, container-relative like `paint()`
 * writes — the anchor end tracks the node's live simulated position, not
 * where the press started, so the line stays put if physics moves it. */
interface PendingEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
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

/** The node (other than `exclude`) whose circle a point falls within —
 * what an edge drag releases onto. A zero-size band read through the same
 * `overlaps` test as the marquee, so a point and a sweep hit-test the same
 * way for the same reason. */
function nodeUnder(
  elements: Map<string, HTMLElement>,
  point: { x: number; y: number },
  exclude: string,
): string | undefined {
  const band: Band = { x: point.x, y: point.y, width: 0, height: 0 };
  for (const [id, element] of elements) {
    if (id !== exclude && overlaps(band, element.getBoundingClientRect())) return id;
  }
  return undefined;
}

function Node({
  armed,
  chosen,
  item,
  onBox,
  onContextMenu,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
  register,
}: {
  /** A pending edge is dragged over this node — releasing now joins it. */
  armed: boolean;
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
  const place = usePool(() => pool.isPlace(item.id));

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
      className={[
        box ? "node can-grow" : "node",
        place ? "is-place" : "",
        chosen ? "is-chosen" : "",
        armed ? "is-edge-target" : "",
      ]
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
      title={place ? `${caption || "untitled"} — a place, click to go in` : undefined}
    >
      <div className="node-shape">
        {image ? <img alt="" draggable={false} src={image} /> : null}
      </div>
      {/* Outside the shape: it clips to a circle, and the mark rides the
          edge rather than sitting under it. */}
      {place && <span className="node-place">{PLACE_GLYPH}</span>}
      {caption && <span className="node-caption">{caption}</span>}
    </div>
  );
}
