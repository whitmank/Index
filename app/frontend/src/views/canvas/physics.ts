// Authored by Karter Whitman using Claude Opus 4.8
// The canvas simulation, framework-free — this module knows nothing about
// React or the DOM, which is the physics/display seam the parent repo's
// ForceGraph established and ARCHITECTURE asks us to keep.
//
// The decisions here are ported from kwhitman.xyz and are settled, not
// exploratory:
//
//   · **One force.** A per-node spring toward `center + offset`. No
//     node-to-node interaction at all. Every node shares the same strength
//     and, on resize, the same centre shift — so they ease by the same
//     vector: the constellation translates as a whole, keeps its shape,
//     and gravitates back to the middle when the viewport changes.
//   · **Offset from centre is what persists.** `ox`/`oy` are
//     viewport-independent; the live target is `centre + offset`, clamped.
//     A node pinned to an edge in a small window returns to its true spot
//     when the window grows.
//   · **The margin is half the *expanded* box**, not the resting radius.
//     A node can never rest close enough to a wall for its hover form to
//     clip, so hover never has to move it.
//
// The one departure is the machinery: the parent used d3-force, but a
// single spring is a dozen lines, so this runs its own rAF loop and the
// dependency is gone.

export const NODE_RADIUS = 48;

/** Kept in step with the hover preview's cap in Canvas.css. */
export const PREVIEW_MAX_WIDTH = 230;
export const PREVIEW_MAX_HEIGHT = 180;

const SPRING_STRENGTH = 0.12;
const ALPHA_DECAY = 0.0228;
const ALPHA_MIN = 0.001;
const REHEAT_ALPHA = 0.4;

export interface SimNode {
  id: string;
  /** The persisted, viewport-independent position: offset from centre. */
  ox: number;
  oy: number;
  /** Where the node actually is, in viewport coordinates. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** The hover-expanded box, once known. Absent on nodes that don't grow. */
  hw?: number;
  hh?: number;
  /** The node's home on the ring — where it sits when the set holds no
   * opinion about it. Undoing a `place` returns it here. */
  rx: number;
  ry: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface Simulation {
  nodes: SimNode[];
  /** Wake the simulation — after a resize, a box-size change, a new node. */
  reheat(): void;
  /** Hold a node still while it is dragged. */
  hold(id: string | null): void;
  setViewport(viewport: Viewport): void;
  /** Move a held node, clamped, updating the offset it will keep. */
  dragTo(id: string, x: number, y: number): void;
  setBox(id: string, width: number, height: number): void;
  /** Adopt positions the set now holds — an undo, a redo, or another
   * view's write. A node the set no longer places returns to its ring. */
  syncPlacements(placed: ReadonlyMap<string, { x: number; y: number }>): void;
  stop(): void;
}

function marginX(node: SimNode, viewport: Viewport): number {
  return node.hw != null ? Math.min(node.hw, viewport.width) / 2 : NODE_RADIUS;
}

function marginY(node: SimNode, viewport: Viewport): number {
  return node.hh != null ? Math.min(node.hh, viewport.height) / 2 : NODE_RADIUS;
}

function clamp(value: number, margin: number, extent: number): number {
  return Math.max(margin, Math.min(extent - margin, value));
}

/** The turn between successive seeds in a phyllotactic spiral — the angle
 * that keeps any two spiral arms from ever lining up radially. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Give every node a home on a phyllotactic spiral around the centre —
 * a sunflower's seed pattern, node `i` at radius `c*sqrt(i)` turned by
 * the golden angle each step — so nothing stacks at the origin, then let
 * a saved position override it.
 *
 * A plain ring only ever grows its rim, so a large set reads as a big
 * empty circle with everything on the edge. The spiral fills the disc,
 * so it stays legible as the node count grows.
 *
 * The parent repo laid the ring out over only the *unplaced* nodes. Here
 * every node gets a slot, placed or not, so that a node always has
 * somewhere to return to when the set stops holding an opinion about it —
 * which is exactly what undoing a `place` means.
 */
export function seedPositions(
  nodes: SimNode[],
  placed: ReadonlyMap<string, { x: number; y: number }>,
  viewport: Viewport,
): void {
  const spacing = NODE_RADIUS * 2 + 20;
  // Vogel's model: this scale keeps the average gap between neighbouring
  // seeds at roughly `spacing`, whatever the count.
  const scale = spacing / Math.sqrt(Math.PI);

  nodes.forEach((node, slot) => {
    const radius = scale * Math.sqrt(slot);
    const angle = slot * GOLDEN_ANGLE;
    node.rx = radius * Math.cos(angle);
    node.ry = radius * Math.sin(angle);

    const saved = placed.get(node.id);
    node.ox = saved ? saved.x : node.rx;
    node.oy = saved ? saved.y : node.ry;
  });

  // Start every node *at* its target, so the first paint is already
  // settled and nothing flies in.
  for (const node of nodes) {
    node.x = clamp(viewport.width / 2 + node.ox, marginX(node, viewport), viewport.width);
    node.y = clamp(viewport.height / 2 + node.oy, marginY(node, viewport), viewport.height);
    node.vx = 0;
    node.vy = 0;
  }
}

export function createSimulation(
  nodes: SimNode[],
  initialViewport: Viewport,
  onTick: () => void,
): Simulation {
  let viewport = initialViewport;
  let alpha = REHEAT_ALPHA;
  let held: string | null = null;
  let frame: number | null = null;
  const byId = new Map(nodes.map((node) => [node.id, node]));

  const targetX = (node: SimNode) =>
    clamp(viewport.width / 2 + node.ox, marginX(node, viewport), viewport.width);
  const targetY = (node: SimNode) =>
    clamp(viewport.height / 2 + node.oy, marginY(node, viewport), viewport.height);

  function tick(): void {
    alpha += (0 - alpha) * ALPHA_DECAY;

    for (const node of nodes) {
      if (node.id === held) continue;
      node.vx += (targetX(node) - node.x) * SPRING_STRENGTH * alpha;
      node.vy += (targetY(node) - node.y) * SPRING_STRENGTH * alpha;
      node.vx *= 0.6;
      node.vy *= 0.6;
      node.x += node.vx;
      node.y += node.vy;
    }

    onTick();

    if (alpha > ALPHA_MIN || held !== null) frame = requestAnimationFrame(tick);
    else frame = null;
  }

  function wake(next = REHEAT_ALPHA): void {
    alpha = Math.max(alpha, next);
    if (frame === null) frame = requestAnimationFrame(tick);
  }

  wake();

  return {
    nodes,
    reheat: () => wake(),
    hold(id) {
      held = id;
      wake(0.3);
    },
    setViewport(next) {
      viewport = next;
      wake();
    },
    dragTo(id, x, y) {
      const node = byId.get(id);
      if (!node) return;
      node.x = clamp(x, marginX(node, viewport), viewport.width);
      node.y = clamp(y, marginY(node, viewport), viewport.height);
      node.vx = 0;
      node.vy = 0;
      // The offset follows the cursor, or the spring would pull the node
      // back to where it started the moment it is let go.
      node.ox = node.x - viewport.width / 2;
      node.oy = node.y - viewport.height / 2;
      onTick();
    },
    setBox(id, width, height) {
      const node = byId.get(id);
      if (!node) return;
      node.hw = width;
      node.hh = height;
      // A tighter margin can shift this node's target; re-settle it.
      wake(0.2);
    },
    syncPlacements(placed) {
      let changed = false;
      for (const node of nodes) {
        const saved = placed.get(node.id);
        const wantX = saved ? saved.x : node.rx;
        const wantY = saved ? saved.y : node.ry;
        // A drag has already set the offset to what it then wrote, so
        // the write coming back matches and nothing moves. Anything that
        // did *not* come from this canvas differs, and is adopted.
        if (Math.abs(wantX - node.ox) < 0.5 && Math.abs(wantY - node.oy) < 0.5) continue;
        node.ox = wantX;
        node.oy = wantY;
        changed = true;
      }
      if (changed) wake();
    },
    stop() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    },
  };
}

/** The hover box an image of this aspect gets, fitted into the cap. */
export function previewBox(naturalWidth: number, naturalHeight: number): {
  width: number;
  height: number;
} {
  if (!naturalWidth || !naturalHeight) {
    return { width: PREVIEW_MAX_WIDTH, height: PREVIEW_MAX_HEIGHT };
  }
  const scale = Math.min(
    PREVIEW_MAX_WIDTH / naturalWidth,
    PREVIEW_MAX_HEIGHT / naturalHeight,
  );
  return {
    width: Math.round(naturalWidth * scale),
    height: Math.round(naturalHeight * scale),
  };
}
