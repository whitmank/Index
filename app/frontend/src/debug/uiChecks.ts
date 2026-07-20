// Authored by Karter Whitman using Claude Opus 4.8
// End-to-end checks that drive the real UI: synthesise the gestures a
// person would make, then ask the pool and the database what happened.
// The phase-3 panel proved the change model; these prove the wiring
// between a gesture and a change, which is the half a unit test cannot
// see.
//
// Set VITE_INDEX_UICHECK=1 to run them on launch; results go to the
// console, which the dev runner forwards to the terminal.
import type { Item } from "@index/database/types";
import { undo } from "../changes/index.js";
import { pool } from "../store/index.js";

export interface CheckLine {
  ok: boolean;
  text: string;
}

export class Checks {
  readonly lines: CheckLine[] = [];

  say(ok: boolean, text: string): void {
    this.lines.push({ ok, text });
    console.log(`${ok ? "✓" : "✗"} ${text}`);
  }

  get failures(): number {
    return this.lines.filter((line) => !line.ok).length;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait for a selector to appear, or give up. */
export async function waitFor<T extends Element>(
  selector: string,
  timeoutMs = 5000,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = document.querySelector<T>(selector);
    if (found) return found;
    await sleep(50);
  }
  return null;
}

function pointer(type: string, x: number, y: number): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    pointerId: 1,
    button: 0,
    buttons: type === "pointerup" ? 0 : 1,
  });
}

/** Press, move, release — the drag a person makes with a mouse. */
export async function dragBy(
  element: Element,
  dx: number,
  dy: number,
): Promise<void> {
  const box = element.getBoundingClientRect();
  const from = { x: box.left + box.width / 2, y: box.top + box.height / 2 };

  element.dispatchEvent(pointer("pointerdown", from.x, from.y));
  await sleep(16);
  // Several moves, as a real pointer would send.
  for (const step of [0.3, 0.6, 1]) {
    window.dispatchEvent(pointer("pointermove", from.x + dx * step, from.y + dy * step));
    await sleep(16);
  }
  window.dispatchEvent(pointer("pointerup", from.x + dx, from.y + dy));
  await sleep(50);
}

/** Press and release without moving — a click. */
export async function clickAt(element: Element): Promise<void> {
  const box = element.getBoundingClientRect();
  const at = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  element.dispatchEvent(pointer("pointerdown", at.x, at.y));
  await sleep(16);
  window.dispatchEvent(pointer("pointerup", at.x, at.y));
  await sleep(50);
}

function readTranslate(transform: string): { x: number; y: number } {
  const match = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(transform);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : { x: 0, y: 0 };
}

function distanceBetween(a: string, b: string): number {
  const from = readTranslate(a);
  const to = readTranslate(b);
  return Math.hypot(from.x - to.x, from.y - to.y);
}

/** The database's own answer, through the bridge path a view uses. */
export async function itemFromDatabase(id: string): Promise<Item | null> {
  const answer = await window.index.items.get(id);
  return "err" in answer ? null : answer.ok.item;
}

/**
 * Drag the first node on the canvas, and check that the position landed
 * on the arrow to this set — in the pool *and* in the database — then
 * that one undo takes it away again.
 */
export async function checkCanvas(setId: string, checks: Checks): Promise<void> {
  const node = await waitFor<HTMLElement>(".node");
  if (!node) {
    checks.say(false, "canvas — no nodes rendered");
    return;
  }

  const nodeCount = document.querySelectorAll(".node").length;
  // A node only learns its expanded box once its image reports an aspect,
  // and `thumb://` mints on first request — so give the probes a moment
  // before counting, or this races them.
  await waitFor(".node.can-grow", 8000);
  await sleep(400);
  const withImages = document.querySelectorAll(".node.can-grow").length;
  checks.say(nodeCount > 0, `canvas draws ${nodeCount} nodes, ${withImages} with image previews`);
  checks.say(withImages > 0, `${withImages} nodes learned a hover box from their image`);

  // Distinct transforms mean the ring seeded rather than everything
  // stacking at the origin.
  const transforms = new Set(
    [...document.querySelectorAll<HTMLElement>(".node")].map((element) => element.style.transform),
  );
  checks.say(transforms.size === nodeCount, `nodes are at ${transforms.size} distinct positions`);

  const itemId = node.dataset.item ?? null;
  if (!itemId) {
    checks.say(false, "canvas — could not identify the dragged node's item");
    return;
  }

  const before = pool.findConnection(itemId, setId, null)?.position ?? null;
  const whereItSat = node.style.transform;
  await dragBy(node, 90, 60);
  await sleep(250);
  checks.say(node.style.transform !== whereItSat, "the node moved on screen");

  const arrow = pool.findConnection(itemId, setId, null);
  const moved = arrow?.position != null && JSON.stringify(arrow.position) !== JSON.stringify(before);
  checks.say(moved, `drag commits a place — position ${JSON.stringify(arrow?.position ?? null)}`);

  const stored = await window.index.sets.members(setId);
  const persisted =
    "ok" in stored &&
    stored.ok.arrows.some(
      (candidate) =>
        candidate.source === itemId &&
        JSON.stringify(candidate.position) === JSON.stringify(arrow?.position ?? null),
    );
  checks.say(persisted, "the database has the same position");

  await undo();
  await sleep(250);
  const afterUndo = pool.findConnection(itemId, setId, null)?.position ?? null;
  checks.say(
    JSON.stringify(afterUndo) === JSON.stringify(before),
    `undo puts the position back to ${JSON.stringify(before)}`,
  );

  // The data going back is only half of it — the node has to go back too,
  // or the canvas is quietly lying about what the set says. Within a few
  // pixels: the spring eases toward its target as alpha decays and never
  // exactly arrives, which is how this kind of simulation behaves.
  await sleep(1500);
  const drift = distanceBetween(node.style.transform, whereItSat);
  checks.say(
    drift < 8,
    `the node returned to where it sat, ${drift.toFixed(1)}px off`,
  );
}

