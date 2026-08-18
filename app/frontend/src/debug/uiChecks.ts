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
import { apply, applyUntracked, changes, undo } from "../changes/index.js";
import { captionOf } from "../lib/derive.js";
import { createItemsFromPaths } from "../lib/intake.js";
import { HOME_SET_ID, MEMBER_OF_LABEL_ID, PUBLIC_SET_ID } from "../lib/seeds.js";
import { history, pool, selection } from "../store/index.js";

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

/**
 * Wait for a set of elements to stop changing size, and answer how many
 * there are. A view that is still loading its members answers differently
 * a moment later, and every element it has already mounted is replaced —
 * so nothing sampled before this returns can be trusted or held onto.
 */
export async function settled(selector: string, timeoutMs = 8000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let last = -1;
  let unchanged = 0;

  while (Date.now() < deadline) {
    const count = document.querySelectorAll(selector).length;
    if (count > 0 && count === last) {
      unchanged += 1;
      if (unchanged >= 4) return count;
    } else {
      unchanged = 0;
      last = count;
    }
    await sleep(100);
  }
  return document.querySelectorAll(selector).length;
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

function rightPointer(type: string, x: number, y: number): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    pointerId: 1,
    button: 2,
    buttons: type === "pointerup" ? 0 : 2,
  });
}

function centerOf(element: Element): { x: number; y: number } {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/** Right button, pressed and released without moving — what should still
 * open a node's context menu (Canvas.tsx's startEdge). */
export async function rightClickAt(element: Element): Promise<void> {
  const at = centerOf(element);
  element.dispatchEvent(rightPointer("pointerdown", at.x, at.y));
  await sleep(16);
  window.dispatchEvent(rightPointer("pointerup", at.x, at.y));
  await sleep(50);
}

/** Right button, held and dragged from one node onto another — the
 * gesture that draws a canvas edge instead of opening the menu. */
export async function dragEdgeTo(source: Element, target: Element): Promise<void> {
  const from = centerOf(source);
  const to = centerOf(target);

  source.dispatchEvent(rightPointer("pointerdown", from.x, from.y));
  await sleep(16);
  for (const step of [0.3, 0.6, 1]) {
    window.dispatchEvent(
      rightPointer("pointermove", from.x + (to.x - from.x) * step, from.y + (to.y - from.y) * step),
    );
    await sleep(16);
  }
  window.dispatchEvent(rightPointer("pointerup", to.x, to.y));
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
  // Scoped to the current pane: the pager keeps its neighbours mounted.
  const nodes = document.querySelectorAll(".pager-pane.is-current .canvas .node").length;
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
export async function checkCanvas(
  setId: string,
  checks: Checks,
  setKind: (kind: "canvas" | "list") => void,
): Promise<void> {
  // Switch to the canvas rather than borrowing the timeline's current
  // page: that page is *today*, and today is empty more often than not.
  setKind("canvas");

  // The set's members are still arriving when the first node appears, and
  // every node mounted before the load finishes is replaced by it. Sample
  // nothing — and hold no element — until the count stops moving.
  const nodeCount = await settled(".canvas .node");
  if (nodeCount === 0) {
    checks.say(false, "canvas — no nodes rendered");
    return;
  }

  // A node only learns its expanded box once its image reports an aspect,
  // and `thumb://` mints on first request — so give the probes a moment
  // before counting, or this races them.
  await waitFor(".node.can-grow", 8000);
  await sleep(400);
  const withImages = document.querySelectorAll(".canvas .node.can-grow").length;
  checks.say(nodeCount > 0, `canvas draws ${nodeCount} nodes, ${withImages} with image previews`);
  checks.say(withImages > 0, `${withImages} nodes learned a hover box from their image`);

  // Distinct transforms mean the ring seeded rather than everything
  // stacking at the origin.
  const transforms = new Set(
    [...document.querySelectorAll<HTMLElement>(".canvas .node")].map(
      (element) => element.style.transform,
    ),
  );
  checks.say(transforms.size === nodeCount, `nodes are at ${transforms.size} distinct positions`);

  // Taken now, from the settled render — an element captured earlier is
  // detached, and dragging it moves nothing.
  const node = document.querySelector<HTMLElement>(".canvas .node");
  const itemId = node?.dataset.item ?? null;
  if (!node || !itemId) {
    checks.say(false, "canvas — could not identify the dragged node's item");
    return;
  }

  const before = pool.findConnection(itemId, setId, MEMBER_OF_LABEL_ID)?.position ?? null;
  const whereItSat = node.style.transform;
  await dragBy(node, 90, 60);
  await sleep(250);
  checks.say(node.style.transform !== whereItSat, "the node moved on screen");

  const arrow = pool.findConnection(itemId, setId, MEMBER_OF_LABEL_ID);
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
  const afterUndo = pool.findConnection(itemId, setId, MEMBER_OF_LABEL_ID)?.position ?? null;
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
 * Right-clicking a node now means two things, and only the up-stroke
 * tells them apart (Canvas.tsx's startEdge): held and released quickly
 * without travelling, it is still the click the context menu answers to;
 * held and dragged onto another node, it draws an edge between the two
 * instead — the same kind `connectionsAmong` already renders.
 */
export async function checkCanvasEdges(
  checks: Checks,
  setKind: (kind: "canvas" | "list") => void,
): Promise<void> {
  setKind("canvas");
  const nodeCount = await settled(".canvas .node");
  if (nodeCount < 2) {
    checks.say(false, "canvas edges — fewer than two nodes to connect");
    return;
  }

  const [a, b] = [...document.querySelectorAll<HTMLElement>(".canvas .node")];
  if (!a || !b) {
    checks.say(false, "canvas edges — could not find two nodes to connect");
    return;
  }
  const aId = a.dataset.item ?? "";
  const bId = b.dataset.item ?? "";

  // Quick — still the click the menu has always answered to.
  await rightClickAt(a);
  checks.say(Boolean(document.querySelector(".menu")), "a rapid right click still opens the context menu");
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(50);

  // Held past the rapid window without moving arms nothing — no menu, no
  // edge; the gesture is simply let go.
  a.dispatchEvent(rightPointer("pointerdown", centerOf(a).x, centerOf(a).y));
  await sleep(400);
  window.dispatchEvent(rightPointer("pointerup", centerOf(a).x, centerOf(a).y));
  await sleep(50);
  checks.say(!document.querySelector(".menu"), "holding past the rapid window does not open the menu");
  checks.say(!pool.findConnection(aId, bId, null), "and does not connect anything either");

  // Held and dragged onto another node, the same button draws an edge.
  const before = pool.findConnection(aId, bId, null);
  await dragEdgeTo(a, b);
  await sleep(250);
  checks.say(!document.querySelector(".menu"), "a dragged right click did not open the menu");

  const after = pool.findConnection(aId, bId, null);
  checks.say(Boolean(after) && !before, `the drag connected the two nodes (${after?.id ?? "none"})`);
  checks.say(
    Boolean(document.querySelector(".canvas-edges .canvas-edge:not(.canvas-edge-pending)")),
    "an edge line is drawn between them",
  );
  // The whole point of `relate` over `tag`: a freehand edge is a plain,
  // unlabelled connection, and unlabelled is no longer structural — b
  // does not become a place just because something pointed at it.
  checks.say(!pool.isPlace(bId), "the edge did not turn its target into a place");

  const detail = await window.index.items.get(aId);
  const persisted =
    "ok" in detail && detail.ok.outbound.some((candidate) => candidate.connection.id === after?.id);
  checks.say(persisted, "the database has the same connection");

  await undo();
  await sleep(250);
  checks.say(!pool.findConnection(aId, bId, null), "undo removes the connection");
}


/**
 * The one navigation primitive. Clicking a place walks into it and grows
 * the trail; clicking a crumb walks back out. The half this proves that
 * no unit test can is that the *same gesture* does both — which is only
 * safe because the node says which kind of thing it is.
 */
export async function checkNavigation(
  checks: Checks,
  setKind: (kind: "canvas" | "list") => void,
): Promise<void> {
  setKind("canvas");
  await settled(".canvas .node");

  const place = document.querySelector<HTMLElement>(".canvas .node.is-place");
  if (!place) {
    checks.say(false, "navigation — no place on the canvas to walk into");
    return;
  }

  const name = place.querySelector(".node-caption")?.textContent ?? "";
  checks.say(
    Boolean(place.querySelector(".node-place")),
    `a place wears its view kind (${name || "untitled"})`,
  );

  // `~` is the floor of every trail but wears no crumb of its own — ⌂
  // already says it — so the trail this reads only ever lists what's
  // beyond it.
  const trail = () => [...document.querySelectorAll(".bar-crumb")].map((c) => c.textContent ?? "");
  const before = trail();

  await clickAt(place);
  const walkedIn = await waitUntil(() => trail().length === before.length + 1, 4000);
  checks.say(walkedIn, `clicking a place walks in — trail is ${trail().join(" / ")}`);
  checks.say(trail()[trail().length - 1] === name, `the last crumb is the place you entered`);
  checks.say(!document.querySelector(".focus"), "walking in did not open the focus view instead");

  // Back out again, by the crumb behind you — ⌂ itself when that crumb
  // is `~`, which owns no crumb to click.
  const back =
    before.length === 0
      ? document.querySelector<HTMLButtonElement>(".bar-home")
      : document.querySelectorAll<HTMLButtonElement>(".bar-crumb")[before.length - 1];
  back?.click();
  const walkedOut = await waitUntil(() => trail().length === before.length, 4000);
  checks.say(walkedOut, "the crumb behind you walks back out");
  checks.say(trail().join(" / ") === before.join(" / "), "the trail is where it started");
}

/**
 * Open an item, edit it through the real editing surface, and check that
 * every write landed in the pool *and* the database — then that undo
 * walks each one back.
 */
export async function checkFocus(checks: Checks): Promise<void> {
  await waitFor<HTMLElement>(".canvas .node");
  // A place would be walked into, not opened — this check is about the
  // editing surface, so it needs a thing.
  const node = document.querySelector<HTMLElement>(".canvas .node:not(.is-place)");
  if (!node) {
    checks.say(false, "focus — no thing to open (every node is a place)");
    return;
  }
  const itemId = node.dataset.item ?? "";

  // Opening a thing is a trail entry now too (App.tsx's unified `path`) —
  // it appends a crumb rather than the old, trail-blind overlay.
  const trail = () => [...document.querySelectorAll(".bar-crumb")].map((c) => c.textContent ?? "");
  const nodeName = node.querySelector(".node-caption")?.textContent ?? "";
  const beforeOpen = trail();

  await clickAt(node);
  const focus = await waitFor<HTMLElement>(".focus");
  checks.say(Boolean(focus), "clicking a node opens its focus view");
  if (!focus) return;

  checks.say(
    trail().length === beforeOpen.length + 1,
    `opening a thing appends a crumb for it — trail is ${trail().join(" / ")}`,
  );
  checks.say(trail()[trail().length - 1] === nodeName, "the last crumb is the thing you opened");

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
  checks.say(trail().join(" / ") === beforeOpen.join(" / "), "dismissing it pops the crumb back off");
}

function historyDepth(): number {
  return history.entries().done.length;
}

/**
 * Wait for a change to be *recorded*, not merely applied. The pool moves
 * optimistically, so a check that reads the pool and then undoes can beat
 * `history.record` to it and undo the change before — which looks exactly
 * like a broken undo.
 */
async function settledChange(depthBefore: number, timeoutMs = 4000): Promise<void> {
  await waitUntil(() => historyDepth() > depthBefore, timeoutMs);
  await sleep(150);
}

/** Switch to the canvas and wait for the timeline to be gone: its pages
 * are canvases too, and sampling across the swap hands back nodes that
 * are about to be unmounted. */
async function intoCanvas(setKind: (kind: "canvas" | "list") => void): Promise<void> {
  setKind("canvas");
  await waitUntil(() => !document.querySelector(".pager-viewport"), 4000);
  await settled(".canvas .node");
}

/**
 * Selection and the batch it enables. The half no unit test can see is
 * that picking things out and *going* somewhere are the same click with
 * and without a modifier — and that twenty items added to a set is one
 * change, so one undo takes all of them back out.
 */
export async function checkSelection(
  checks: Checks,
  setKind: (kind: "canvas" | "list") => void,
): Promise<void> {
  setKind("canvas");
  const nodeCount = await settled(".canvas .node");
  if (nodeCount < 2) {
    checks.say(false, "selection — not enough nodes on the canvas to pick from");
    return;
  }

  const nodes = () => [...document.querySelectorAll<HTMLElement>(".canvas .node")];

  // ⌘-click picks out rather than navigating — the one gesture that has
  // to differ from a plain click, and the one that must not navigate.
  for (const node of nodes().slice(0, 2)) await pickAt(node);
  const picked = await waitUntil(() => selection.count() === 2, 3000);
  checks.say(picked, `⌘-click picks out without navigating — ${selection.count()} picked`);
  checks.say(!document.querySelector(".focus"), "picking did not open the item instead");
  checks.say(
    document.querySelectorAll(".canvas .node.is-chosen").length === 2,
    "the picked nodes are drawn as picked",
  );

  // ⌘A takes what is on screen.
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "a", metaKey: true, bubbles: true, cancelable: true }),
  );
  const all = await waitUntil(() => selection.count() === nodeCount, 3000);
  checks.say(all, `⌘A takes all ${nodeCount} on screen`);

  // Escape puts it down.
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  const cleared = await waitUntil(() => selection.count() === 0, 3000);
  checks.say(cleared, "Escape puts the selection down");
  checks.say(
    document.querySelectorAll(".canvas .node.is-chosen").length === 0,
    "and nothing is drawn as picked any more",
  );

  // A sweep across the whole canvas catches what it covers.
  const surface = document.querySelector<HTMLElement>(".canvas");
  if (!surface) {
    checks.say(false, "selection — no canvas to sweep");
    return;
  }
  const area = surface.getBoundingClientRect();
  await sweep(surface, { x: area.left + 2, y: area.top + 2 }, {
    x: area.right - 2,
    y: area.bottom - 2,
  });
  const swept = await waitUntil(() => selection.count() > 0, 3000);
  checks.say(swept, `a sweep of the canvas caught ${selection.count()} of ${nodeCount}`);

  // The batch itself: everything picked, into one set, in one change.
  const target = pool
    .all()
    .filter(pool.isItem)
    .find((item) => pool.isPlace(item.id) && !item.system);
  if (!target) {
    checks.say(false, "selection — no set to add a batch to");
    return;
  }
  const targetName = target.display_name ?? target.name;
  // A sweep of `~` catches the sets drawn on it too, and one of them may
  // be the very set being added to. Nothing can be its own member, so it
  // is not part of what this expects to land.
  const members = selection.ids().filter((id) => id !== target.id);
  const selfCaught = selection.count() - members.length;
  // Asked of the database, not the pool. The pool only holds arrows into
  // sets it has loaded, so reading "who is already in there" from it —
  // for a set this view has never opened — answers a confident zero and
  // makes a correct skip look like a lost write.
  const already = await window.index.sets.members(target.id);
  const before =
    "ok" in already
      ? members.filter((id) => already.ok.items.some((member) => member.id === id)).length
      : 0;

  // The verb, said in the bar: ⌘K, type it, ⇥ to take it, then complete
  // the target — the whole grammar, driven from the keyboard.
  const beforeBatch = historyDepth();
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true, cancelable: true }),
  );
  const field = await waitFor<HTMLInputElement>(".command-input");
  checks.say(Boolean(field), "⌘K opens the bar with something picked out");
  if (!field) return;

  typeInto(field, "add to");
  const offered = await waitUntil(
    () => document.querySelector(".command-row.is-verb .command-row-name") !== null,
    4000,
  );
  const verbName =
    document.querySelector(".command-row.is-verb .command-row-name")?.textContent ?? "";
  checks.say(offered, `typing "add to" offers the verb — "${verbName}"`);

  field.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
  const stagedChip = await waitFor(".command-verb", 3000);
  checks.say(Boolean(stagedChip), `⇥ takes the verb and holds it — "${stagedChip?.textContent ?? ""}"`);
  checks.say(field.value === "", "and clears the field for its argument");

  const onlyPlaces = [...document.querySelectorAll(".command-row-kind")].every((kind) =>
    ["timeline", "canvas", "list", "new"].includes(kind.textContent ?? ""),
  );
  checks.say(onlyPlaces, "the argument offers only places — a thing cannot hold things");

  typeInto(field, targetName.toLowerCase());
  await waitUntil(
    () =>
      [...document.querySelectorAll(".command-row-name")].some(
        (row) => row.textContent === targetName,
      ),
    4000,
  );
  field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  await sleep(600);

  const arrows = members.filter((id) => pool.findConnection(id, target.id, MEMBER_OF_LABEL_ID)).length;
  checks.say(
    arrows === members.length && arrows > before,
    `${arrows} of ${members.length} landed in '${targetName}'` +
      ` (${before} were already there${selfCaught ? `, and it skipped itself` : ""})`,
  );
  checks.say(selection.count() === 0, "the batch done, the selection is released");

  const stored = await window.index.sets.members(target.id);
  const persisted =
    "ok" in stored && members.every((id) => stored.ok.items.some((item) => item.id === id));
  checks.say(persisted, "the database has the same members");

  // One decision, one undo — once that decision is actually recorded.
  await settledChange(beforeBatch);
  // One decision is one entry, however many things it touched — and it
  // touches only the ones that needed it.
  const stack = history.entries().done;
  const top = stack[stack.length - 1];
  checks.say(
    (top?.pairs.length ?? 0) === members.length - before,
    `the batch is a single history entry of ${top?.pairs.length ?? 0} pairs — "${top?.description ?? "none"}"`,
  );
  await undo();
  await sleep(500);
  const afterUndo = members.filter((id) => pool.findConnection(id, target.id, MEMBER_OF_LABEL_ID)).length;
  checks.say(afterUndo === before, `one undo takes the whole batch back out (${afterUndo} left)`);
}

/**
 * Leaving a set without being deleted. Two halves, and the refusal is
 * the more important one: a set that holds its members by query cannot
 * have them taken out, and the menu has to say so rather than remove an
 * arrow and let the query put the item straight back.
 */
export async function checkRemoveFromSet(
  checks: Checks,
  setKind: (kind: "canvas" | "list") => void,
): Promise<void> {
  setKind("canvas");
  await settled(".canvas .node");

  const openMenuOn = async (element: Element): Promise<void> => {
    const box = element.getBoundingClientRect();
    element.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true, cancelable: true, clientX: box.left, clientY: box.top,
      }),
    );
    await waitFor(".menu");
  };
  const entryNamed = (fragment: string) =>
    [...document.querySelectorAll<HTMLButtonElement>(".menu-item")].find((entry) =>
      entry.textContent?.startsWith(fragment),
    );

  // In `~`, which holds everything, the entry is there and refuses.
  const node = document.querySelector<HTMLElement>(".canvas .node:not(.is-place)");
  if (!node) {
    checks.say(false, "remove — no thing on the canvas to try it on");
    return;
  }
  await openMenuOn(node);
  const refused = entryNamed("Remove from");
  checks.say(Boolean(refused), `the menu offers "${refused?.textContent ?? "nothing"}"`);
  checks.say(refused?.classList.contains("warn") ?? false, "it is drawn as a severing, not a delete");
  checks.say(
    (refused?.disabled ?? false) && (refused?.title ?? "").includes("holds everything"),
    `in a set that holds everything it refuses, and says why — "${refused?.title ?? ""}"`,
  );
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(200);

  // Now the other half, in a set whose membership is arrows alone.
  const itemId = node.dataset.item ?? "";
  const item = pool.getItem(itemId);
  const target = pool.getItem(PUBLIC_SET_ID);
  if (!item || !target) {
    checks.say(false, "remove — no arrow-only set seeded to try it in");
    return;
  }
  const already = Boolean(pool.findConnection(itemId, target.id, MEMBER_OF_LABEL_ID));
  if (!already) await apply(changes.tag(item, target));
  await sleep(300);

  selection.clear();
  await goToByName(captionOf(target));
  setKind("canvas");
  await settled(".canvas .node");

  const there = document.querySelector<HTMLElement>(`.canvas .node[data-item="${cssId(itemId)}"]`);
  if (!there) {
    checks.say(false, `remove — '${captionOf(item)}' never appeared in '${captionOf(target)}'`);
    return;
  }

  const beforeRemove = historyDepth();
  await openMenuOn(there);
  const remove = entryNamed("Remove from");
  checks.say(
    Boolean(remove) && !remove?.disabled,
    `in '${captionOf(target)}' the same entry is live — "${remove?.textContent ?? ""}"`,
  );
  remove?.click();
  await sleep(600);

  checks.say(
    !pool.findConnection(itemId, target.id, MEMBER_OF_LABEL_ID),
    "removing takes the arrow away",
  );
  checks.say(Boolean(pool.getItem(itemId)), "and leaves the item itself standing");

  const gone = await waitUntil(
    () => !document.querySelector(`.canvas .node[data-item="${cssId(itemId)}"]`),
    4000,
  );
  checks.say(gone, "the view read the set again, so it actually left");

  const stored = await window.index.sets.members(target.id);
  checks.say(
    "ok" in stored && !stored.ok.items.some((member) => member.id === itemId),
    "the database agrees it is out",
  );

  await settledChange(beforeRemove);

  await undo();
  await sleep(500);
  checks.say(
    Boolean(pool.findConnection(itemId, target.id, MEMBER_OF_LABEL_ID)),
    "undo puts it back in the set",
  );

  // The half that a pool assertion cannot see: undo is a change the view
  // did not make, so nothing tells it to read the set again unless the
  // view is watching membership itself. Without that the row is restored
  // in the data and still missing from the screen, which reads exactly
  // like a broken undo.
  const backOnScreen = await waitUntil(
    () => Boolean(document.querySelector(`.canvas .node[data-item="${cssId(itemId)}"]`)),
    5000,
  );
  checks.say(backOnScreen, "and the view shows it again without being told to look");

  // Leave the set as we found it, then go home.
  if (!already) {
    await undo();
    await sleep(400);
  }
  await goToByName(captionOf(pool.getItem(HOME_SET_ID) ?? item));
}

/** Walk somewhere through the command bar — the way a person would. */
async function goToByName(name: string): Promise<void> {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true, cancelable: true }),
  );
  const field = await waitFor<HTMLInputElement>(".command-input");
  if (!field) return;
  typeInto(field, name.toLowerCase());
  await waitUntil(
    () =>
      [...document.querySelectorAll(".command-row-name")].some((row) => row.textContent === name),
    4000,
  );
  field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  await sleep(500);
}

/** Record ids carry characters a selector cannot take raw. */
function cssId(id: string): string {
  return id.replace(/["\\]/g, "\\$&");
}

/**
 * The two delete keys, which have to mean two different things: ⌫ takes
 * the picked items out of the set and asks nothing, ⌘⌫ takes the items
 * themselves and asks first. Getting these the wrong way round is the
 * kind of mistake a person only has to make once to lose something, so
 * the check watches what each one leaves behind.
 */
export async function checkDeleteKeys(
  checks: Checks,
  setKind: (kind: "canvas" | "list") => void,
): Promise<void> {
  const target = pool.getItem(PUBLIC_SET_ID);
  if (!target) {
    checks.say(false, "delete keys — no arrow-only set to work in");
    return;
  }
  const press = (key: string, meta = false) =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key, metaKey: meta, bubbles: true, cancelable: true }),
    );

  // ⌫ in `~`, which holds everything, must refuse and say so rather than
  // look broken.
  await intoCanvas(setKind);
  const first = document.querySelector<HTMLElement>(".canvas .node:not(.is-place)");
  if (!first) {
    checks.say(false, "delete keys — nothing on the canvas to pick");
    return;
  }
  await pickAt(first);
  const picked1 = await waitUntil(() => selection.count() === 1, 3000);
  checks.say(picked1, "a thing is picked out to try the keys on");
  press("Backspace");
  const complained = await waitFor(".troubles li", 3000);
  checks.say(
    Boolean(complained) && (complained?.textContent ?? "").includes("holds everything"),
    `⌫ in a set that holds everything says why instead — "${complained?.textContent?.replace("✕", "") ?? "nothing"}"`,
  );
  checks.say(selection.count() === 1, "and it keeps the selection, having done nothing");
  document.querySelector<HTMLButtonElement>(".troubles button")?.click();

  // Put two items somewhere they can actually leave from.
  const items = [...document.querySelectorAll<HTMLElement>(".canvas .node:not(.is-place)")]
    .slice(0, 2)
    .flatMap((element) => {
      const found = pool.getItem(element.dataset.item ?? "");
      return found ? [found] : [];
    });
  if (items.length < 2) {
    checks.say(false, "delete keys — not enough things to work with");
    return;
  }
  const restore = items.filter((item) => !pool.findConnection(item.id, target.id, MEMBER_OF_LABEL_ID));
  await apply(changes.tagMany(items, target));
  await sleep(400);

  selection.clear();
  await goToByName(captionOf(target));
  await intoCanvas(setKind);

  // ⌫ where the arrows are real: out of the set, no questions asked.
  press("a", true);
  const took = await waitUntil(() => selection.count() > 0, 3000);
  if (!took) {
    checks.say(false, "delete keys — ⌘A took nothing in the target set");
    return;
  }
  const picked = selection.ids();
  const beforeRemoval = historyDepth();
  press("Backspace");
  const left = await waitUntil(
    () => picked.every((id) => !pool.findConnection(id, target.id, MEMBER_OF_LABEL_ID)),
    4000,
  );
  checks.say(left, `⌫ takes all ${picked.length} out of '${captionOf(target)}' with no prompt`);
  checks.say(!document.querySelector(".confirm"), "and it asked nothing, because undo is enough");
  checks.say(
    picked.every((id) => Boolean(pool.getItem(id))),
    "the items themselves are untouched",
  );

  await settledChange(beforeRemoval);
  await undo();
  await sleep(500);
  checks.say(
    picked.every((id) => Boolean(pool.findConnection(id, target.id, MEMBER_OF_LABEL_ID))),
    "one undo puts them all back in",
  );

  // ⌘⌫ asks, and ↵ answers.
  selection.replace([items[0]?.id ?? ""]);
  await sleep(200);
  press("Backspace", true);
  const prompt = await waitFor<HTMLElement>(".confirm", 3000);
  checks.say(Boolean(prompt), "⌘⌫ asks first");
  checks.say(
    (prompt?.textContent ?? "").includes("Delete"),
    `it names what it would take — "${prompt?.querySelector(".confirm-question")?.textContent ?? ""}"`,
  );

  // Escape leaves everything standing.
  prompt?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  await sleep(300);
  checks.say(!document.querySelector(".confirm"), "Escape dismisses the prompt");
  checks.say(Boolean(pool.getItem(items[0]?.id ?? "")), "and nothing was deleted");

  // And ↵ goes through with it.
  const beforeDelete = historyDepth();
  press("Backspace", true);
  const again = await waitFor<HTMLElement>(".confirm", 3000);
  again?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  const deleted = await waitUntil(() => !pool.getItem(items[0]?.id ?? ""), 4000);
  checks.say(deleted, "↵ confirms, and the item is gone");
  checks.say(selection.count() === 0, "the selection goes with what it held");

  await settledChange(beforeDelete);
  await undo();
  await sleep(500);
  checks.say(Boolean(pool.getItem(items[0]?.id ?? "")), "one undo brings it back");

  // Leave the set as we found it.
  if (restore.length > 0) {
    await apply(changes.untagMany(restore, target));
    await sleep(300);
  }
  await goToByName(captionOf(pool.getItem(HOME_SET_ID) ?? target));
}

/**
 * The two ways of saying "this one" that need no modifier: pointing at a
 * node on the canvas, and clicking a row in the list. What has to hold is
 * that pointing yields — once something is picked deliberately, crossing
 * the canvas must not undo it — and that a list row still opens, on the
 * second click rather than the first.
 */
export async function checkPointing(
  checks: Checks,
  setKind: (kind: "canvas" | "list") => void,
): Promise<void> {
  selection.clear();
  await intoCanvas(setKind);
  const nodes = [...document.querySelectorAll<HTMLElement>(".canvas .node")];
  const [first, second] = nodes;
  if (!first || !second) {
    checks.say(false, "pointing — not enough nodes on the canvas");
    return;
  }

  await pointAt(first);
  const pointed = await waitUntil(() => selection.has(first.dataset.item ?? ""), 3000);
  checks.say(pointed, "pointing at a node picks it out, with no click at all");
  checks.say(selection.count() === 1, "and only it");

  await pointAt(second);
  const moved = await waitUntil(() => selection.has(second.dataset.item ?? ""), 3000);
  checks.say(moved && selection.count() === 1, "pointing elsewhere moves the pick, rather than adding");

  // Looking away puts it down: the pointer's pick lasts exactly as long
  // as the pointer is on it.
  await pointAwayFrom(second);
  const dropped = await waitUntil(() => selection.count() === 0, 3000);
  checks.say(dropped, "and leaving the node puts it down again");

  // Something picked on purpose silences the pointer.
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "a", metaKey: true, bubbles: true, cancelable: true }),
  );
  const deliberate = await waitUntil(() => selection.count() === nodes.length, 3000);
  checks.say(deliberate, `⌘A picks all ${nodes.length} deliberately`);

  await pointAt(first);
  await sleep(200);
  checks.say(
    selection.count() === nodes.length,
    "and pointing no longer speaks — the deliberate pick survives crossing the canvas",
  );

  // Escape hands the voice back.
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await waitUntil(() => selection.count() === 0, 3000);
  await pointAt(first);
  const restored = await waitUntil(() => selection.count() === 1, 3000);
  checks.say(restored, "Escape empties it, and pointing picks again");
  await pointAwayFrom(first);

  // The list: one click chooses, two open.
  selection.clear();
  setKind("list");
  await waitUntil(() => document.querySelectorAll(".row").length > 1, 6000);
  const row = document.querySelector<HTMLElement>(".row");
  const rowId = row?.dataset.item ?? "";
  if (!row) {
    checks.say(false, "pointing — no rows to click");
    return;
  }

  row.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  const chose = await waitUntil(() => selection.has(rowId), 3000);
  checks.say(chose && selection.count() === 1, "one click on a row chooses it");
  checks.say(!document.querySelector(".focus"), "and does not open it");
  checks.say(
    document.querySelectorAll(".row.is-chosen").length === 1,
    "the row is drawn as chosen",
  );

  row.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
  const opened = await waitFor(".focus", 4000);
  checks.say(Boolean(opened), "two clicks open it");

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(300);
  selection.clear();
  setKind("canvas");
}

/** Move the pointer off something, the way React hears it. */
async function pointAwayFrom(element: Element): Promise<void> {
  element.dispatchEvent(
    new PointerEvent("pointerout", {
      bubbles: true, cancelable: true, pointerId: 5, relatedTarget: document.body,
    }),
  );
  await sleep(80);
}

/** Move the pointer over something, the way React hears it. */
async function pointAt(element: Element): Promise<void> {
  const box = element.getBoundingClientRect();
  element.dispatchEvent(
    new PointerEvent("pointerover", {
      bubbles: true, cancelable: true, pointerId: 5,
      clientX: box.left, clientY: box.top, relatedTarget: null,
    }),
  );
  await sleep(80);
}

/** A click with ⌘ held — the gesture that picks out instead of going. */
async function pickAt(element: Element): Promise<void> {
  const box = element.getBoundingClientRect();
  const at = { x: box.left, y: box.top };
  element.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true, cancelable: true, pointerId: 3, button: 0, buttons: 1,
      clientX: at.x, clientY: at.y, metaKey: true,
    }),
  );
  await sleep(16);
  window.dispatchEvent(
    new PointerEvent("pointerup", {
      bubbles: true, cancelable: true, pointerId: 3, button: 0, buttons: 0,
      clientX: at.x, clientY: at.y, metaKey: true,
    }),
  );
  await sleep(60);
}

/** Draw a rubber band from one point to another across a surface. */
async function sweep(
  surface: Element,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  surface.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true, cancelable: true, pointerId: 4, button: 0, buttons: 1,
      clientX: from.x, clientY: from.y,
    }),
  );
  await sleep(16);
  for (const step of [0.25, 0.5, 0.75, 1]) {
    window.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true, cancelable: true, pointerId: 4, button: 0, buttons: 1,
        clientX: from.x + (to.x - from.x) * step,
        clientY: from.y + (to.y - from.y) * step,
      }),
    );
    await sleep(16);
  }
  window.dispatchEvent(
    new PointerEvent("pointerup", {
      bubbles: true, cancelable: true, pointerId: 4, button: 0, buttons: 0,
      clientX: to.x, clientY: to.y,
    }),
  );
  await sleep(80);
}

/**
 * The command bar: reach anything by name, and land on it the way its
 * role says you should. What no unit test can see is the half that
 * matters — that ↵ on a set walks you there and ↵ on a thing opens it,
 * from the same field, with nothing but the row's own glyph to warn you
 * which it will be.
 */
export async function checkCommandBar(checks: Checks): Promise<void> {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true, cancelable: true }),
  );
  const field = await waitFor<HTMLInputElement>(".command-input");
  checks.say(Boolean(field), "⌘K opens the command bar");
  if (!field) return;

  // Nothing is picked yet, so the one verb the app knows is unavailable
  // — and an unavailable verb only shows once it is asked for by name,
  // same as it always has. What's new is what's *not* here: no place, no
  // thing, nothing to go anywhere with — that moved to the nav bar.
  await sleep(150);
  const empty = document.querySelector(".command-empty")?.textContent ?? "";
  checks.say(empty === "no commands", `nothing picked, nothing offered by default (said "${empty}")`);

  const rowNames = () =>
    [...document.querySelectorAll(".command-row-name")].map((row) => row.textContent ?? "");
  typeInto(field, "add");
  await waitUntil(() => rowNames().some((name) => name === "add to…"), 4000);
  const row = [...document.querySelectorAll<HTMLElement>(".command-row")].find(
    (candidate) => candidate.querySelector(".command-row-name")?.textContent === "add to…",
  );
  checks.say(Boolean(row), '"add" finds "add to…" by name, unavailable or not');
  checks.say(row?.hasAttribute("disabled") ?? false, "and it is disabled, because nothing is picked out");

  const kinds = [...document.querySelectorAll(".command-row-kind")].map((el) => el.textContent ?? "");
  checks.say(
    kinds.every((kind) => kind === "command" || kind === "unavailable"),
    `every row is a verb, none a destination — ${kinds.join(", ")}`,
  );

  // Dispatched on the field itself, not the window: the bar's Escape
  // handling is a React handler on the input, which only ever sees
  // events that bubble up through it.
  field.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  const closed = await waitUntil(() => !document.querySelector(".command"), 3000);
  checks.say(closed, "Escape closes the bar");
}

/**
 * ⌘L opens the nav bar: destinations, split back out of the command bar
 * they used to share (checkCommandBar covers what stayed behind). It
 * opens quiet — nothing offered until a name is typed, on purpose, so
 * opening the field is never itself a wall of suggestions. Typed, it
 * searches both sets and things by a substring of their name; ↵ on
 * either jumps the trail straight to it — a set as the space on the
 * stage, a thing opened in focus — since picking something this way
 * never claims to have walked through anywhere to get there (App.tsx's
 * `jump`/`openJump`).
 */
export async function checkNavBar(homeSetId: string, checks: Checks): Promise<void> {
  const open = async (): Promise<HTMLInputElement | null> => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "l", metaKey: true, bubbles: true, cancelable: true }),
    );
    return waitFor<HTMLInputElement>(".nav-input");
  };
  const rowNames = () =>
    [...document.querySelectorAll(".nav-row-name")].map((row) => row.textContent ?? "");
  const trail = () => [...document.querySelectorAll(".bar-crumb")].map((c) => c.textContent ?? "");

  let field = await open();
  checks.say(Boolean(field), "⌘L opens the nav bar");
  if (!field) return;

  // Empty, it offers nothing at all — the field opens quiet, not with
  // every set already laid out to scan past.
  await sleep(200);
  checks.say(!document.querySelector(".nav-dropdown"), "empty, it offers nothing");

  const homeName = pool.getItem(homeSetId)?.display_name ?? pool.getItem(homeSetId)?.name ?? "";
  const targetItem = pool
    .all()
    .filter(pool.isItem)
    .find(
      (item) =>
        pool.isPlace(item.id) && item.id !== homeSetId && (item.display_name ?? item.name).length > 3,
    );
  if (!targetItem) {
    checks.say(false, "nav bar — no other place in the pool to search for");
    return;
  }
  const target = targetItem.display_name ?? targetItem.name;

  // A set, found by a fragment of its name that is not its start — the
  // reason this is a substring search and not a prefix one.
  const fragment = target.slice(1, 4).toLowerCase();
  typeInto(field, fragment);
  const found = await waitUntil(() => rowNames().some((name) => name === target), 4000);
  checks.say(found, `"${fragment}" finds "${target}" from the middle of its name`);

  const kind = document.querySelector(".nav-row.is-at .nav-row-kind")?.textContent ?? "";
  checks.say(kind === "place", `the selected row says it is a place (${kind})`);

  // ↵ on a place walks there — and the trail starts over, because you
  // did not walk through anywhere to get there.
  field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  const walked = await waitUntil(() => trail().join("/") === target, 4000);
  checks.say(walked, `↵ on a set goes there — trail is ${trail().join(" / ") || "(empty)"}`);
  checks.say(!document.querySelector(".focus"), "going to a set did not open it as a thing instead");
  checks.say(!document.querySelector(".nav-input"), "the field closed behind you");

  // ↵ on a thing opens it where you stand — and, like a set, the trail
  // starts over at it (`openJump`): picking something from search never
  // claims to have walked through wherever you were a moment ago.
  const thing = pool
    .all()
    .filter(pool.isItem)
    .find((item) => !pool.isPlace(item.id) && (item.display_name ?? item.name).length > 3);
  if (!thing) {
    checks.say(false, "nav bar — no thing in the pool to look for");
    return;
  }
  const thingName = thing.display_name ?? thing.name;

  field = await open();
  if (!field) {
    checks.say(false, "nav bar — would not reopen");
    return;
  }
  typeInto(field, thingName.slice(0, 6).toLowerCase());
  await waitUntil(() => rowNames().some((name) => name === thingName), 4000);
  const row = [...document.querySelectorAll<HTMLElement>(".nav-row")].find(
    (candidate) => candidate.querySelector(".nav-row-name")?.textContent === thingName,
  );
  checks.say(Boolean(row), `searching finds the item "${thingName}"`);
  // mousedown, not click: the field takes the row on mousedown so its own
  // blur never races the click closed.
  row?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));

  const openedIt = await waitFor(".focus", 4000);
  checks.say(Boolean(openedIt), "picking a thing opens it in focus");
  checks.say(
    trail().join(" / ") === thingName,
    `picking a thing from search jumps the trail to it too — trail is ${trail().join(" / ") || "(empty)"}`,
  );

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(300);

  // Focus is what's open here, not the field — Escape dismisses it
  // (App.tsx's `closeOpened`), and since the thing we opened was the
  // trail's only entry, popping it empties the trail, which falls back
  // to home. The explicit search-and-Enter below is redundant with that
  // — already home — but harmless, and doubles as its own small check
  // that jumping to where you already are doesn't do anything stranger.
  field = await open();
  if (!field) return;
  typeInto(field, homeName.toLowerCase());
  await waitUntil(() => rowNames().some((name) => name === homeName), 4000);
  field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  await waitUntil(() => !document.querySelector(".nav-input"), 4000);

  field = await open();
  if (!field) return;
  field.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  const closed = await waitUntil(() => !document.querySelector(".nav-input"), 3000);
  checks.say(closed, "Escape closes the field");
  checks.say(trail().length === 0, `and left you home, where ⌂ alone says it (${trail().join(" / ") || "(empty)"})`);
}

/**
 * Switch to the list, sort it, reorder a row by its handle, and check
 * that the order landed on the arrows — then that the "sorted manually"
 * chip clears every one of them in a single undo.
 */
export async function checkList(
  setId: string,
  checks: Checks,
  setKind: (kind: "canvas" | "list") => void,
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

  const arrow = pool.findConnection(movedId, setId, MEMBER_OF_LABEL_ID);
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
    pool.findConnection(movedId, setId, MEMBER_OF_LABEL_ID)?.order == null,
    "the chip's ✕ clears the manual order",
  );

  await undo();
  await sleep(400);
  checks.say(
    pool.findConnection(movedId, setId, MEMBER_OF_LABEL_ID)?.order === 0,
    "and one undo brings the manual order back",
  );

  // leave the set as we found it
  await undo();
  await sleep(400);
  setKind("canvas");
}

/**
 * The `parse` verb, end to end against a real file on disk.
 *
 * This is the check that could not be written any other way. The unit
 * tests prove the filename parser, the merge rules and the join
 * separately; only this one proves that clicking the button in Focus
 * reaches a probe, reads a 15 MB scan whose own metadata is empty and a
 * lie, and writes the right six facts into the database.
 *
 * The fixture is a book whose bytes declare nothing except a re-wrapper's
 * 2019 timestamp, and whose name carries everything — so a pass here is
 * also the precedence rule holding in the real pipeline.
 */
export async function checkParsing(checks: Checks, filepath: string): Promise<void> {
  const type = await window.index.schemas.upsert({
    name: "book",
    attributes: [
      { attribute: "title", kind: "string", display: true },
      { attribute: "author", kind: "string", display: true },
      { attribute: "published", kind: "date", display: true },
      { attribute: "publisher", kind: "string", display: true },
      { attribute: "isbn", kind: "string", display: true },
      { attribute: "pages", kind: "number", display: true },
    ],
  });
  if ("err" in type) {
    checks.say(false, `parse — could not define the book type (${String(type.err)})`);
    return;
  }

  const made = await createItemsFromPaths([filepath]);
  const item = made[0];
  if (!item) {
    checks.say(false, `parse — nothing was created from ${filepath}`);
    return;
  }
  checks.say(item.type?.value === "book", `a 366-page pdf arrives typed "${item.type?.value}"`);

  // Stripped back to what an item added before this feature existed looks
  // like: named after its file, typed but unconfirmed, no fields. That is
  // the item `parse` is for, and it is the state the user's own copy of
  // this book is in. Untracked, so the undo below undoes the *parsing*.
  // Renamed to something a command-bar search can find, on both the item
  // and its resource — the rename rule fires when the two match, and what
  // is actually read is the resource's *uri*, which still points at the
  // real 15 MB file.
  const stub = "buddha check";
  const bare: Item = {
    ...item,
    name: stub,
    type: item.type ? { value: item.type.value, prov: "auto" } : null,
    metadata: [],
    resources: item.resources.map((one, at) => (at === 0 ? { ...one, name: stub } : one)),
  };
  await applyUntracked({ description: "strip", pairs: [{ before: item, after: bare }] });
  await sleep(300);
  checks.say(
    (pool.getItem(item.id)?.metadata ?? []).length === 0,
    "starting from an item with nothing filled in",
  );

  // Opened through the nav bar — ⌘L, type, ↵ — which is how a person
  // reaches a thing by name. Not the canvas: home's membership is a
  // query, and the canvas reloads on arrows rather than on someone
  // minting a record behind it.
  const before = stub;
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "l", metaKey: true, bubbles: true, cancelable: true }),
  );
  const search = await waitFor<HTMLInputElement>(".nav-input");
  if (!search) {
    checks.say(false, "parse — the nav bar never opened");
    return;
  }
  typeInto(search, "buddha");
  const listed = await waitUntil(
    () => [...document.querySelectorAll(".nav-row-name")].some((r) => r.textContent === stub),
    5000,
  );
  checks.say(listed, `search finds the item ("${stub}")`);
  search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  const focus = await waitFor<HTMLElement>(".focus");
  if (!focus) {
    checks.say(false, "parse — the focus view never opened");
    return;
  }

  const button = focus.querySelector<HTMLButtonElement>('.item-screen-icon-button[aria-label="parse"]');
  checks.say(Boolean(button), "focus offers a parse button");
  if (!button) return;
  checks.say(!button.disabled, "and it is available on a typed item");

  // A real click, not `clickAt`: that one synthesises pointer events for
  // the canvas, and a button's onClick never hears them.
  const depth = historyDepth();
  button.click();
  await settledChange(depth, 15000);
  await sleep(400);

  const parsed = await itemFromDatabase(item.id);
  const value = (name: string) =>
    (parsed?.metadata ?? []).find((entry) => entry.attribute === name)?.value ?? "";

  checks.say(
    parsed?.name === "The Buddha in the Machine: Art, Technology, and the Meeting of East and West",
    `it took the book's real title — "${parsed?.name}" (was "${before}")`,
  );
  checks.say(value("author") === "R. John Williams", `author = "${value("author")}"`);
  checks.say(
    value("published") === "2014-01-01",
    `published = "${value("published")}" — the name's year, not the file's 2019 re-wrap`,
  );
  checks.say(value("publisher") === "Yale University Press", `publisher = "${value("publisher")}"`);
  checks.say(value("isbn") === "9780300206579", `isbn = "${value("isbn")}"`);
  checks.say(value("pages") === "366", `pages = "${value("pages")}" — read from the file itself`);
  checks.say(parsed?.type?.prov === "user", "parsing settled the type as yours");

  await undo();
  await sleep(500);
  const reverted = await itemFromDatabase(item.id);
  checks.say(
    reverted?.name === before && (reverted?.metadata ?? []).length <= 2,
    "one undo takes the whole parsing back",
  );

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(300);
}
