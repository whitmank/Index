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
import { history, pool } from "../store/index.js";

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

/** Wait for a condition to hold, or give up. */
export async function waitUntil(holds: () => boolean, timeoutMs = 5000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (holds()) return true;
    await sleep(50);
  }
  return false;
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

/**
 * Type into a React-controlled input. Setting `.value` directly is
 * invisible to React — it tracks the last value it rendered — so the
 * native setter is called and an input event dispatched, which is what a
 * real keystroke ends up doing.
 */
export function typeInto(element: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(prototype.prototype, "value")?.set;
  setter?.call(element, text);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

export function pressEnter(element: Element): void {
  element.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
  );
}

/** The database's own answer, through the bridge path a view uses. */
export async function itemFromDatabase(id: string): Promise<Item | null> {
  const answer = await window.index.items.get(id);
  return "err" in answer ? null : answer.ok.item;
}

/**
 * Turn the timeline back and forward, and check that the page actually
 * changes and lands where the skip-empty rule says it should.
 */
export async function checkTimeline(checks: Checks): Promise<void> {
  const nav = await waitFor<HTMLElement>(".timeline-nav");
  if (!nav) {
    checks.say(false, "timeline — no pager rendered");
    return;
  }

  const label = () =>
    document.querySelector(".pager-pane.is-current .page-head h2")?.textContent ?? "";
  const dateOf = () => document.querySelector(".pager-pane.is-current .page-date")?.textContent ?? "";

  await waitFor(".pager-pane.is-current .page-date");
  const started = { label: label(), date: dateOf() };
  checks.say(started.label === "today", `timeline opens on today (${started.date})`);

  // The pager only knows which days it can turn to once the set's dates
  // have loaded, so wait for the control to arm rather than racing it.
  const older = nav.querySelector<HTMLButtonElement>("button:first-of-type");
  const armed = await waitUntil(() => Boolean(older && !older.disabled), 6000);
  if (!older || !armed) {
    checks.say(false, "timeline — the back control never armed");
    return;
  }

  older.click();
  await sleep(500);
  const turned = dateOf();
  checks.say(turned !== started.date && turned < started.date, `turning back lands on ${turned}`);

  // Every day it lands on has members — that is the skip-empty rule.
  const nodes = document.querySelectorAll(".pager-pane.is-current .node").length;
  checks.say(nodes > 0, `the day it landed on has ${nodes} members`);

  const newer = nav.querySelector<HTMLButtonElement>("button:last-of-type");
  newer?.click();
  await sleep(500);
  checks.say(dateOf() === started.date, `turning forward returns to ${started.date}`);
}

/**
 * Drag the first node on the canvas, and check that the position landed
 * on the arrow to this set — in the pool *and* in the database — then
 * that one undo takes it away again.
 */
export async function checkCanvas(setId: string, checks: Checks): Promise<void> {
  const node = await waitFor<HTMLElement>(".pager-pane.is-current .node");
  if (!node) {
    checks.say(false, "canvas — no nodes rendered");
    return;
  }

  const nodeCount = document.querySelectorAll(".pager-pane.is-current .node").length;
  // A node only learns its expanded box once its image reports an aspect,
  // and `thumb://` mints on first request — so give the probes a moment
  // before counting, or this races them.
  await waitFor(".node.can-grow", 8000);
  await sleep(400);
  const withImages = document.querySelectorAll(".pager-pane.is-current .node.can-grow").length;
  checks.say(nodeCount > 0, `canvas draws ${nodeCount} nodes, ${withImages} with image previews`);
  checks.say(withImages > 0, `${withImages} nodes learned a hover box from their image`);

  // Distinct transforms mean the ring seeded rather than everything
  // stacking at the origin.
  const transforms = new Set(
    [...document.querySelectorAll<HTMLElement>(".pager-pane.is-current .node")].map(
      (element) => element.style.transform,
    ),
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


/**
 * Open an item, edit it through the real editing surface, and check that
 * every write landed in the pool *and* the database — then that undo
 * walks each one back.
 */
export async function checkFocus(checks: Checks): Promise<void> {
  const node = await waitFor<HTMLElement>(".pager-pane.is-current .node");
  if (!node) {
    checks.say(false, "focus — no node to open");
    return;
  }
  const itemId = node.dataset.item ?? "";

  await clickAt(node);
  const focus = await waitFor<HTMLElement>(".focus");
  checks.say(Boolean(focus), "clicking a node opens its focus view");
  if (!focus) return;

  const chip = focus.querySelector(".opens-as .chip")?.textContent ?? "";
  checks.say(chip.startsWith("opens as"), `the opens-as chip reads "${chip}"`);

  const slot = focus.querySelector(".content-slot");
  checks.say(Boolean(slot), `the content slot rendered (${slot?.className ?? "absent"})`);

  // rename, through the name field, committing on blur
  const nameField = focus.querySelector<HTMLInputElement>(".focus-name");
  if (!nameField) {
    checks.say(false, "focus — no name field");
    return;
  }
  const originalName = nameField.value;
  nameField.focus();
  typeInto(nameField, "renamed by the checks");
  nameField.blur();
  await sleep(300);

  const renamedInPool = pool.getItem(itemId)?.name;
  const renamedInDb = (await itemFromDatabase(itemId))?.name;
  checks.say(
    renamedInPool === "renamed by the checks" && renamedInDb === "renamed by the checks",
    `commit-on-settle renamed it (pool "${renamedInPool}", database "${renamedInDb}")`,
  );

  // an unchanged value must not write at all
  const depthBeforeNoop = historyDepth();
  nameField.focus();
  nameField.blur();
  await sleep(200);
  checks.say(historyDepth() === depthBeforeNoop, "leaving a field unchanged writes nothing");

  // tag, through the composer — mints the target in the same change
  const term = focus.querySelector<HTMLInputElement>(".composer-term");
  if (!term) {
    checks.say(false, "focus — no connection composer");
    return;
  }
  typeInto(term, "checkstag");
  pressEnter(term);
  await sleep(500);

  const tagged = pool
    .outboundFrom(itemId)
    .map((connection) => pool.getItem(connection.target)?.name)
    .filter(Boolean);
  checks.say(tagged.includes("checkstag"), `the composer tagged it (${tagged.join(", ") || "nothing"})`);

  await undo();
  await sleep(400);
  const afterUndo = pool
    .outboundFrom(itemId)
    .map((connection) => pool.getItem(connection.target)?.name)
    .filter(Boolean);
  checks.say(!afterUndo.includes("checkstag"), "undo takes the tag and its target back");

  await undo();
  await sleep(400);
  checks.say(
    pool.getItem(itemId)?.name === originalName,
    `undo restores the name to "${originalName}"`,
  );

  // dismiss
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(300);
  checks.say(!document.querySelector(".focus"), "Escape dismisses the focus view");
}

function historyDepth(): number {
  return history.entries().done.length;
}

/**
 * Switch to the list, sort it, reorder a row by its handle, and check
 * that the order landed on the arrows — then that the "sorted manually"
 * chip clears every one of them in a single undo.
 */
export async function checkList(
  setId: string,
  checks: Checks,
  setKind: (kind: "timeline" | "canvas" | "list") => void,
): Promise<void> {
  setKind("list");

  const list = await waitFor<HTMLElement>(".list");
  if (!list) {
    checks.say(false, "list — never rendered");
    return;
  }
  await waitUntil(() => document.querySelectorAll(".row").length > 1, 6000);

  const ids = () => [...document.querySelectorAll<HTMLElement>(".row")].map((row) => row.dataset.item ?? "");
  const before = ids();
  checks.say(before.length > 1, `list draws ${before.length} rows`);

  // sorting by a column reorders the rows
  const nameHeader = list.querySelector<HTMLButtonElement>(".list-head .col-name");
  nameHeader?.click();
  await sleep(200);
  const byName = ids();
  checks.say(
    byName.join() !== before.join() || byName.length < 2,
    "clicking a column header sorts by it",
  );

  // drag the last row's handle up to the top
  const rows = [...document.querySelectorAll<HTMLElement>(".row")];
  const last = rows[rows.length - 1];
  const first = rows[0];
  if (!last || !first) {
    checks.say(false, "list — not enough rows to reorder");
    return;
  }
  const movedId = last.dataset.item ?? "";

  const handle = last.querySelector<HTMLElement>(".col-handle");
  if (!handle) {
    checks.say(false, "list — no drag handle");
    return;
  }

  const handleBox = handle.getBoundingClientRect();
  const firstBox = first.getBoundingClientRect();
  handle.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true, cancelable: true, pointerId: 2, button: 0, buttons: 1,
      clientX: handleBox.left + 4, clientY: handleBox.top + 4,
    }),
  );
  await sleep(30);
  window.dispatchEvent(
    new PointerEvent("pointerup", {
      bubbles: true, cancelable: true, pointerId: 2, button: 0, buttons: 0,
      clientX: firstBox.left + 4, clientY: firstBox.top + 2,
    }),
  );
  await sleep(500);

  const arrow = pool.findConnection(movedId, setId, null);
  checks.say(arrow?.order === 0, `reorder wrote order ${String(arrow?.order)} onto the arrow`);
  checks.say(
    Boolean(document.querySelector(".list-manual")),
    "the 'sorted manually' chip appeared",
  );
  checks.say(ids()[0] === movedId, "the row moved to the top");

  // the chip's ✕ clears every manual order in one change
  const revert = document.querySelector<HTMLButtonElement>(".list-manual button");
  revert?.click();
  await sleep(500);
  checks.say(
    pool.findConnection(movedId, setId, null)?.order == null,
    "the chip's ✕ clears the manual order",
  );

  await undo();
  await sleep(400);
  checks.say(
    pool.findConnection(movedId, setId, null)?.order === 0,
    "and one undo brings the manual order back",
  );

  // leave the set as we found it
  await undo();
  await sleep(400);
  setKind("timeline");
}
