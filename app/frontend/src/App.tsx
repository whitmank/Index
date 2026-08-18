// Authored by Karter Whitman using Claude Sonnet 5
// The shell: a trail that says where you are (top-left), a view switcher
// that says how you're looking at it (top-right), and one surface at a
// time on the stage — wherever you've walked to, plus the focus overlay
// above it. There is no separate home screen (DESIGN-CONCEPT §7,
// PRODUCT-SPEC §3.1): launching the app *is* opening `~`, the set of
// everything, and the trail never runs out from under you — the floor
// beneath every jump is `~`, not nothing.
//
// There is one navigation primitive: `goTo`. A place you enter, a thing
// you open — both are trail entries now (store/location.ts's
// `PathEntry`), so the address bar remembers either kind and a refresh
// restores exactly where you were, focus view included. The views still
// draw the difference (a place swaps the stage, a thing overlays it) so
// the same click never surprises you; only the bookkeeping is unified.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Item } from "@index/database/types";
import { apply, applyUntracked, changes } from "./changes/index.js";
import { commandsFor } from "./commands/index.js";
import { CommandBar } from "./components/CommandBar.tsx";
import { Confirm } from "./components/Confirm.tsx";
import { DescribeCapture } from "./components/DescribeCapture.tsx";
import { NavBar, type NavBarHandle } from "./components/NavBar.tsx";
import { DebugPanel } from "./debug/DebugPanel.tsx";
import {
  Checks,
  checkCanvas,
  checkCanvasEdges,
  checkCommandBar,
  checkDeleteKeys,
  checkFocus,
  checkParsing,
  checkList,
  checkNavBar,
  checkNavigation,
  checkPointing,
  checkRemoveFromSet,
  checkSelection,
} from "./debug/uiChecks.js";
import { useArrowNav } from "./hooks/useArrowNav.ts";
import { useCapturePrompt } from "./hooks/useCapturePrompt.ts";
import { useSelectionKeys } from "./hooks/useSelectionKeys.ts";
import { isEditing, useUndoRedo } from "./hooks/useUndoRedo.ts";
import { captionOf } from "./lib/derive.js";
import { parseItems } from "./lib/parseItems.js";
import { captureFromPaths } from "./lib/intake.js";
import { HOME_SET_ID } from "./lib/seeds.js";
import { holdsEverything } from "./lib/sets.js";
import { homeEntry, readStoredPath, storePath, type PathEntry } from "./store/location.js";
import {
  errors,
  loadItem,
  loadSet,
  pool,
  selection,
  usePool,
  useSelection,
  useTroubles,
  useViewMode,
  type ViewMode,
  VIEW_MODE_GLYPH,
  VIEW_MODES,
} from "./store/index.js";
import { Canvas } from "./views/canvas/Canvas.tsx";
import { Focus } from "./views/focus/Focus.tsx";
import { List } from "./views/list/List.tsx";
import { Settings, type SettingsTab } from "./views/settings/Settings.tsx";
import "./components/CommandBar.css";
import "./components/Confirm.css";
import "./components/DescribeCapture.css";
import "./views/canvas/Canvas.css";
import "./views/focus/Focus.css";
import "./views/list/List.css";
// Settings' own Types tab is `SchemaEditor` from this file, not the
// standalone `SchemaManager` the top bar used to open — but the styles
// live here, and Settings.tsx doesn't import them itself.
import "./views/schemas/SchemaManager.css";
import "./views/settings/Settings.css";

export function App() {
  useUndoRedo();

  // VITE_INDEX_VIEW forces a view for looking at one without clicking; the
  // ui checks likewise expect a particular one running.
  const forcedView = (VIEW_MODES as string[]).includes(import.meta.env.VITE_INDEX_VIEW ?? "")
    ? (import.meta.env.VITE_INDEX_VIEW as (typeof VIEW_MODES)[number])
    : null;

  // The trail — places walked into and things opened, in the order they
  // happened — `~` always at the bottom of it: the launch state and the
  // floor every `goBack` eventually lands on. Read from where the last
  // session left it (store/location.ts), so a refresh reopens the same
  // place — or the same opened item — instead of falling back to `~`.
  const [path, setPath] = useState<PathEntry[]>(readStoredPath);
  // How you look at a set's members — canvas or list — is one persisted,
  // application-level choice (store/viewMode.ts), not anything a set
  // remembers about itself; it follows you from set to set.
  const [viewMode, setViewMode] = useViewMode();
  useEffect(() => {
    if (forcedView) setViewMode(forcedView);
    // Only ever forced once, at mount — a dev/test entry point, not a
    // live binding to the env var.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [commanding, setCommanding] = useState(false);
  const navBarRef = useRef<NavBarHandle>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const capturePrompt = useCapturePrompt();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const troubles = useTroubles();

  // The space actually on the stage — the nearest trailing entry that's a
  // walked-into place, skipping any things opened on top of it. Never
  // empty: every primitive that moves the trail lands on at least one
  // place-shaped entry (`closeOpened` falls back to `homeEntry()` rather
  // than ever letting the trail run out).
  const currentSetId = useMemo(() => {
    for (let i = path.length - 1; i >= 0; i -= 1) {
      const entry = path[i];
      if (entry && !entry.open) return entry.id;
    }
    return HOME_SET_ID;
  }, [path]);

  // The last crumb, when it's a thing rather than a place — what Focus
  // shows. Read straight from the trail instead of kept as separate
  // state, so a refresh remembers it exactly the way it remembers the
  // trail itself.
  const openedEntry = path[path.length - 1];
  const opened = openedEntry?.open ? { id: openedEntry.id, isNew: openedEntry.isNew } : null;

  /** The set on the stage — what "remove from" means. */
  const currentSet = usePool(() => pool.getItem(currentSetId) ?? null);

  // The trail, resolved to records so the crumbs can name themselves.
  const crumbs = usePool(() =>
    path.map((entry) => ({ id: entry.id, item: pool.getItem(entry.id), open: entry.open })),
  );

  /**
   * Who holds an arrow into the set on the stage. Membership is the union
   * of a query and these arrows, so when this changes — by a removal, an
   * undo, or another window — who is in the set may have changed and the
   * view has to read it again. It is the *sources*, not the arrows: a
   * drag writes a position onto an arrow that is already there, and must
   * not reload the canvas out from under the hand doing the dragging.
   */
  const membership = usePool(() =>
    pool
      .arrowsInto(currentSetId)
      .map((arrow) => arrow.source)
      .sort()
      .join(" "),
  );

  // Canvas and list both show the whole set at once; the actions below
  // need it too, since taking members out means reading who is left.
  const readMembers = useCallback(() => {
    void loadSet(currentSetId).then(setMemberIds);
    // `membership` is not read here; it is a dependency so that a change
    // to who is in the set re-runs this, whoever made that change.
  }, [currentSetId, membership]);

  /**
   * Arrive at a position on the trail — a place entered or a thing
   * opened, or several at once when a crumb click or a jump truncates
   * back through some of both. Every way of getting somewhere ends here.
   *
   * Anything that falls off the trail here and was a still-blank item
   * opened by the very gesture that made it (`open: true, isNew: true`)
   * is discarded, untracked — you looked at it and moved on, and there
   * is nothing about an empty draft worth keeping. This used to live in
   * Focus's own dismiss handler, but a crumb click or a fresh `enter`
   * elsewhere can now drop such an entry without Focus's handler ever
   * firing, so the check belongs to the one place every trail change
   * already passes through.
   */
  const arriveAt = useCallback(
    (trail: PathEntry[]) => {
      const surviving = new Set(trail.map((entry) => `${entry.id}:${entry.open}`));
      for (const entry of path) {
        if (surviving.has(`${entry.id}:${entry.open}`)) continue;
        if (!entry.open || !entry.isNew) continue;
        const current = pool.getItem(entry.id);
        if (!current || !isBlankDraft(current)) continue;
        const discard = changes.deleteItem(current);
        if (discard) void applyUntracked(discard);
      }

      setPath(trail);
      storePath(trail);
      selection.clear();
    },
    [path],
  );

  /** Walk into a place: it becomes the last crumb. Going somewhere
   * already on the trail truncates back to it rather than pushing a
   * second copy. */
  const enter = useCallback(
    (id: string) => {
      const at = path.findIndex((entry) => entry.id === id && !entry.open);
      const trail = at === -1 ? [...path, { id, open: false, isNew: false }] : path.slice(0, at + 1);
      arriveAt(trail);
    },
    [arriveAt, path],
  );

  /** Go straight to a place from the command bar. Unlike entering, this
   * did not walk through anywhere, so it does not claim to have: the
   * trail starts over at the destination — unless you jumped to a place
   * already behind you, which is a walk back. */
  const jump = useCallback(
    (id: string) => {
      const at = path.findIndex((entry) => entry.id === id && !entry.open);
      const trail = at === -1 ? [{ id, open: false, isNew: false }] : path.slice(0, at + 1);
      arriveAt(trail);
    },
    [arriveAt, path],
  );

  /** The item equivalent of `enter`: what's opened becomes the last
   * crumb too, rather than a separate overlay the trail knows nothing
   * about. Matching is on `(id, open)` together, not `id` alone — that's
   * what lets the same item appear twice (entered as a place, and
   * separately opened as itself via "About") without ambiguity. */
  const open = useCallback(
    (id: string, isNew = false) => {
      const at = path.findIndex((entry) => entry.id === id && entry.open);
      const trail = at === -1 ? [...path, { id, open: true, isNew }] : path.slice(0, at + 1);
      arriveAt(trail);
    },
    [arriveAt, path],
  );

  /** The item equivalent of `jump` — picking a thing straight from the
   * nav bar's search didn't walk through anywhere either, so the trail
   * starts over at it the same way `jump` does for a place. */
  const openJump = useCallback(
    (id: string) => {
      const at = path.findIndex((entry) => entry.id === id && entry.open);
      const trail = at === -1 ? [{ id, open: true, isNew: false }] : path.slice(0, at + 1);
      arriveAt(trail);
    },
    [arriveAt, path],
  );

  // Kept current every render so the once-only VITE_INDEX_OPEN effect
  // below can call the latest `open` without depending on it — depending
  // on it would tear the effect's interval down and restart it on every
  // navigation, which the effect's own once-only bookkeeping assumes
  // never happens.
  const openRef = useRef(open);
  openRef.current = open;

  /**
   * The one primitive. A place you enter; a thing you open — both are
   * trail entries now. An item you just made is always opened, whatever
   * it looks like — you made it to say something about it.
   */
  const goTo = useCallback(
    (item: { id: string }, isNew?: boolean) => {
      if (!isNew && pool.isPlace(item.id)) enter(item.id);
      else open(item.id, Boolean(isNew));
    },
    [enter, open],
  );

  /** ⌘/ and ⌂ — `~` is titled "All" and holds everything by query
   * (PRODUCT-SPEC §1.4); going there is this shell's whole notion of
   * "root", and the floor every trail now starts and ends on. */
  const goAll = useCallback(() => jump(HOME_SET_ID), [jump]);

  /** ← — one step back on the trail: the same place clicking the crumb
   * behind the current one would land you. `~` is the floor — back from
   * it, or from a trail a jump started elsewhere, lands on All rather
   * than going anywhere stranger. Only ever reached while nothing is
   * open (`overlayOpen` gates the keys that call this off otherwise), so
   * the entry it pops is always a place. */
  const goBack = useCallback(() => {
    const last = path[path.length - 1];
    if (path.length <= 1) {
      if (last?.id !== HOME_SET_ID) goAll();
      return;
    }
    arriveAt(path.slice(0, -1));
  }, [path, arriveAt, goAll]);

  /** Focus's dismiss: pop the item it's showing off the trail. Unlike
   * `goBack`, this always has to succeed in closing it — even when the
   * open item is the trail's only entry (reachable via `openJump`, a
   * direct search pick with nothing behind it) — so an emptied trail
   * falls back to the floor rather than refusing to move. */
  const closeOpened = useCallback(() => {
    const rest = path.slice(0, -1);
    arriveAt(rest.length > 0 ? rest : [homeEntry()]);
  }, [path, arriveAt]);

  /** A crumb behind the current one, clicked: walk back to exactly that
   * position in the trail. Index-based rather than a fresh `enter`,
   * which would have to guess whether that position was a place or a
   * thing — the trail already knows. */
  const goToCrumb = useCallback((index: number) => arriveAt(path.slice(0, index + 1)), [arriveAt, path]);

  /** The last crumb, clicked: open what you're standing in — a place's
   * own record (PRODUCT-SPEC §3.4's "About X"), how a set's own name and
   * fields get edited without leaving it. Already open is a harmless
   * no-op, via the same truncate-to-existing rule `open` applies. */
  const openHere = useCallback(() => {
    const last = path[path.length - 1];
    if (last) open(last.id);
  }, [path, open]);

  /** → — the same primitive as a click or an ↵, aimed at whatever is
   * picked out. Ambiguous with more than one picked, so it does nothing
   * rather than guess which. */
  const goForward = useCallback(() => {
    const ids = selection.ids();
    if (ids.length !== 1) return;
    const item = pool.getItem(ids[0] as string);
    if (item) goTo(item);
  }, [goTo]);

  /**
   * OS file drop, wherever it isn't already claimed. Canvas has its own
   * onDrop for the pages that need a position; everywhere else — Timeline,
   * List — nothing until now handled a drop at all. Checking
   * `defaultPrevented` is how a nested handler says "mine": Canvas's own
   * onDrop calls `preventDefault` before this ever sees the event.
   *
   * Opening what just landed is the whole feedback: a drop outside a
   * canvas has no node to appear, so without this it looks like nothing
   * happened at all (which is exactly the confusion this fixes).
   */
  const onDropAnywhere = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      const paths = [...event.dataTransfer.files].map((file) => window.index.intake.pathForFile(file));
      void captureFromPaths(paths, capturePrompt.describe).then((created) => {
        const last = created[created.length - 1];
        if (last) goTo(last, true);
        // A captured item gets no arrow into a query-held set like `~`,
        // so the stage showing it has to be told to reload.
        if (created.length > 0) readMembers();
      });
    },
    [goTo, capturePrompt.describe, readMembers],
  );

  /**
   * What the nav bar hands back: the same primitive as a click, on the
   * far side of a search. A place is jumped to, a thing is opened over
   * wherever you are — you asked to see it, not to move house.
   */
  const goToPicked = useCallback(
    (id: string) => {
      if (pool.isPlace(id)) jump(id);
      else openJump(id);
    },
    [jump, openJump],
  );

  /** The picked items, as records — what every batch action works on. */
  const pickedItems = useCallback(
    () =>
      selection.ids().flatMap((id) => {
        const item = pool.getItem(id);
        return item ? [item] : [];
      }),
    [],
  );

  /**
   * Put every picked item into one set, as a single change — so one undo
   * takes the whole batch back out. Landing there afterwards would be a
   * second decision the user did not make, so the shell stays put and the
   * selection is released: the batch is done.
   */
  const addPickedTo = useCallback(async (target: Item, targetIsNew = false) => {
    // Read the target first. The arrow-upsert rule is enforced by asking
    // the pool what is already there (PRODUCT-SPEC §1.2), and the pool
    // only holds arrows into sets it has loaded — so adding to a set you
    // are not looking at would otherwise mint a second arrow for members
    // it already has.
    if (!targetIsNew) await loadSet(target.id);

    const change = changes.tagMany(pickedItems(), target, targetIsNew);
    // Everything picked was already in there: nothing happened, and
    // nothing should be recorded as having happened.
    if (change.pairs.length === 0) {
      selection.clear();
      return;
    }
    if (await apply(change)) selection.clear();
  }, [pickedItems]);

  /** The same gesture when the set does not exist yet: the set is minted
   * inside the very same change that fills it, so one undo removes both
   * the members and the set they went into. */
  const addPickedToNew = useCallback(
    (name: string) => {
      void addPickedTo(changes.blankSet(name), true);
    },
    [addPickedTo],
  );

  /** How many things the verbs would act on, so the bar can say so. */
  const pickedCount = useSelection(() => selection.count());

  /**
   * The verbs the bar offers, rebuilt when what they would act on
   * changes — a command that cannot run has to know it, and say why.
   */
  const commands = useMemo(
    () =>
      commandsFor({
        currentSet,
        handlers: {
          addPickedTo: (target, targetIsNew) => void addPickedTo(target, targetIsNew),
          addPickedToNew,
          parsePicked: () => void parseItems(pickedItems()),
        },
        picked: pickedItems(),
      }),
    // `pickedCount` stands in for the selection itself: the commands
    // describe what they would act on, so they are rebuilt when it moves.
    [addPickedTo, addPickedToNew, currentSet, pickedCount, pickedItems],
  );

  /**
   * ⌫ — out of this set, not out of existence. It asks nothing, because
   * one undo is a cheaper apology than a prompt on every removal.
   *
   * Only an arrow can be withdrawn, so a set that holds its members by
   * query keeps them: rather than let the key look broken, say why.
   */
  const removePickedFromSet = useCallback(() => {
    const set = pool.getItem(currentSetId);
    if (!set) {
      errors.surface("This set hasn't loaded yet — try again in a moment.");
      return;
    }

    // Asked before the change is built, not after: in a set that holds
    // everything, some of these may well have arrows — carrying a canvas
    // position, say — and withdrawing one would look like nothing
    // happened, because the query would go on holding the item.
    const name = captionOf(set) || "this set";
    if (holdsEverything(set)) {
      errors.surface(`${name} holds everything, so nothing can be taken out of it.`);
      return;
    }

    const change = changes.untagMany(pickedItems(), set);
    if (change.pairs.length === 0) {
      errors.surface(`${name} matches these by its query — there are no arrows to take away.`);
      return;
    }

    void apply(change).then((ok) => {
      if (!ok) return;
      selection.clear();
      readMembers();
    });
  }, [currentSetId, pickedItems, readMembers]);

  /** ⌘⌫ — the thing itself. The only gesture in the app that asks first. */
  const deletePicked = useCallback(() => {
    setConfirmingDelete(false);
    const change = changes.deleteMany(pickedItems());
    if (change.pairs.length === 0) return;
    void apply(change).then((ok) => {
      if (ok) selection.clear();
    });
  }, [pickedItems]);

  const askToDeletePicked = useCallback(() => {
    // Every one of them is a system item: there is nothing to ask about.
    if (pickedItems().every((item) => item.system)) {
      errors.surface("These are system items, and cannot be deleted.");
      return;
    }
    setConfirmingDelete(true);
  }, [pickedItems]);

  // Everything on this list is over the stage in the same sense: while
  // any of them is up, the surface underneath stops answering to keys
  // that would otherwise reach it.
  const overlayOpen =
    opened !== null || commanding || confirmingDelete || settingsOpen || capturePrompt.pending !== null;

  /**
   * Paste's counterpart to `onDropAnywhere`, for a gesture that has never
   * had one: nothing today turns a pasted file or url into a new item
   * when nothing is focused (Focus's own `onPaste` attaches to the item
   * already open, and only fires while one is). Gated on `overlayOpen`
   * rather than `defaultPrevented` — nothing else on the stage listens
   * for paste yet, so there's no nested handler to defer to — and on the
   * target not being editable, so pasting into a text field still just
   * pastes.
   */
  const onPasteAnywhere = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      if (overlayOpen) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /input|textarea/i.test(target.tagName))) {
        return;
      }

      const files = [...event.clipboardData.files];
      const paths =
        files.length > 0
          ? files.map((file) => window.index.intake.pathForFile(file))
          : [event.clipboardData.getData("text/uri-list") || event.clipboardData.getData("text/plain")].filter(
              (text) => text.trim(),
            );
      if (paths.length === 0) return;

      event.preventDefault();
      void captureFromPaths(paths, capturePrompt.describe).then((created) => {
        const last = created[created.length - 1];
        if (last) goTo(last, true);
        // Same as `onDropAnywhere`: no arrow means no automatic reload.
        if (created.length > 0) readMembers();
      });
    },
    [overlayOpen, goTo, capturePrompt.describe, readMembers],
  );

  // The selection's keys are live only while nothing is over the stage:
  // an open focus view, command bar or prompt asked for them first.
  useSelectionKeys(!overlayOpen, {
    onAskToDelete: askToDeletePicked,
    onBack: goBack,
    onRemoveFromSet: removePickedFromSet,
  });

  // ← and → walk the trail — back a crumb, forward into what is picked
  // out — the same guard as the selection's own keys, plus a text field
  // of its own: a bare arrow in an input has to move the caret, not you.
  useArrowNav(!overlayOpen, { onBack: goBack, onForward: goForward });

  // V — the same toggle as clicking the view button, bare key like the
  // arrows above: a text field owns the letter it types, an overlay owns
  // the keys under it.
  useEffect(() => {
    if (overlayOpen) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditing(event.target)) return;
      if (event.key.toLowerCase() !== "v") return;
      event.preventDefault();
      setViewMode(otherViewMode(viewMode));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [overlayOpen, viewMode, setViewMode]);

  // ⌘K opens the command bar (verbs); ⌘F is the same door under the name
  // the spec gave it (§3.7). ⌘L opens the nav bar (destinations) — the
  // two doors are mutually exclusive, so each closes the other rather
  // than leaving a second field open behind whichever one won the
  // keystroke. ⌘, opens Settings and ⌘/ goes straight to All
  // (PRODUCT-SPEC §1.4's `~`) — all five work while typing, same as
  // ⌘K/⌘F already did: reaching for one of these is exactly what you do
  // when what is under your cursor is not what you wanted.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "k" || key === "f") {
        event.preventDefault();
        navBarRef.current?.stopEditing();
        setCommanding((wasCommanding) => !wasCommanding);
      } else if (key === "l") {
        event.preventDefault();
        setCommanding(false);
        navBarRef.current?.startEditing();
      } else if (key === ",") {
        event.preventDefault();
        setSettingsOpen((open) => !open);
      } else if (key === "/") {
        event.preventDefault();
        goAll();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goAll]);

  // Every crumb has to be able to name itself, however you arrived —
  // walked in, opened, forced by an env var, or restored on the trail.
  useEffect(() => {
    for (const entry of path) {
      if (!pool.getItem(entry.id)) void loadItem(entry.id);
    }
  }, [path]);

  useEffect(readMembers, [readMembers]);

  // VITE_INDEX_OPEN opens the first item whose name matches, once the
  // view is up — for looking at a renderer without hunting for a node.
  const autoOpened = useRef(false);
  useEffect(() => {
    const wanted = import.meta.env.VITE_INDEX_OPEN;
    if (!wanted || autoOpened.current) return;
    const timer = setInterval(() => {
      const match = pool
        .all()
        .find(
          (record) =>
            record.id.startsWith("items:") &&
            (record as { name?: string }).name?.toLowerCase().includes(wanted.toLowerCase()),
        );
      if (!match) return;
      autoOpened.current = true;
      clearInterval(timer);
      openRef.current(match.id);
    }, 250);
    return () => clearInterval(timer);
  }, []);

  // VITE_INDEX_UICHECK drives the real UI with synthetic gestures once the
  // view is up, and reports through the forwarded console.
  const checked = useRef(false);
  useEffect(() => {
    if (!import.meta.env.VITE_INDEX_UICHECK || checked.current) return;
    checked.current = true;
    void (async () => {
      const checks = new Checks();
      // checkTimeline is not run — the timeline view was extracted to
      // views/calendar/Calendar.tsx and is no longer part of the active
      // UI surface (see that file's header comment).
      await checkCanvas(HOME_SET_ID, checks, setViewMode);
      await checkCanvasEdges(checks, setViewMode);
      await checkNavigation(checks, setViewMode);
      await checkFocus(checks);
      await checkList(HOME_SET_ID, checks, setViewMode);
      await checkCommandBar(checks);
      await checkNavBar(HOME_SET_ID, checks);
      await checkSelection(checks, setViewMode);
      await checkRemoveFromSet(checks, setViewMode);
      await checkDeleteKeys(checks, setViewMode);
      await checkPointing(checks, setViewMode);
      // Needs a real file to read, so it runs only when pointed at one.
      const toParse = import.meta.env.VITE_INDEX_UICHECK_FILE;
      if (toParse) await checkParsing(checks, toParse);
      console.log(
        checks.failures
          ? `${checks.failures} of ${checks.lines.length} ui checks failed`
          : `all ${checks.lines.length} ui checks passed`,
      );
    })();
  }, []);

  if (typeof window.index === "undefined") {
    return (
      <main className="placeholder">
        <h1>Index</h1>
        <p className="check-line">bridge: absent</p>
      </main>
    );
  }

  if (import.meta.env.VITE_INDEX_DEBUG) {
    return (
      <main className="placeholder">
        <h1>Index</h1>
        <DebugPanel />
      </main>
    );
  }

  return (
    <div
      className="shell"
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDropAnywhere}
      onPaste={onPasteAnywhere}
    >
      <header className="bar">
        {/* `~` is already said by ⌂ — shown as a crumb of its own only
            when a jump left it out of the trail. */}
        <NavBar
          atHome={currentSetId === HOME_SET_ID}
          crumbs={path[0]?.id === HOME_SET_ID ? crumbs.slice(1) : crumbs}
          onEnter={goToCrumb}
          onHome={goAll}
          onOpenHere={openHere}
          onPick={goToPicked}
          ref={navBarRef}
        />

        {/* The nav bar's own box is the "go to…" door now — click it, or
            ⌘L — so nothing here duplicates that. Just the two things
            left that aren't going anywhere: how you're looking, and the
            settings behind it. */}
        <button
          aria-label={`Viewing as ${viewMode} — switch to ${otherViewMode(viewMode)}`}
          className="bar-icon"
          onClick={() => setViewMode(otherViewMode(viewMode))}
          title={`${viewMode} view — press V to switch`}
          type="button"
        >
          <span aria-hidden="true">{VIEW_MODE_GLYPH[viewMode]}</span>
        </button>

        <button aria-label="Settings" className="bar-icon" onClick={() => setSettingsOpen(true)} title="Settings (⌘,)" type="button">
          <span aria-hidden="true">⚙</span>
        </button>
      </header>

      <div className="stage">
        {viewMode === "canvas" && (
          <Canvas
            describe={capturePrompt.describe}
            itemIds={memberIds}
            onGoTo={goTo}
            onMembersChanged={readMembers}
            setId={currentSetId}
          />
        )}
        {viewMode === "list" && (
          <List
            itemIds={memberIds}
            onGoTo={goTo}
            onMembersChanged={readMembers}
            setId={currentSetId}
          />
        )}
      </div>

      {opened && (
        <Focus
          isNew={opened.isNew}
          itemId={opened.id}
          key={opened.id}
          onDismiss={closeOpened}
          // Following a connection is the same primitive as anywhere else:
          // a place takes you there, a thing swaps the focus to it.
          onGoTo={goTo}
        />
      )}

      {settingsOpen && (
        <Settings onClose={() => setSettingsOpen(false)} onTabChange={setSettingsTab} tab={settingsTab} />
      )}

      {commanding && (
        <CommandBar commands={commands} onClose={() => setCommanding(false)} pickedCount={pickedCount} />
      )}

      {confirmingDelete && (
        <Confirm
          note="One undo brings them back."
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={deletePicked}
          question={deleteQuestion(pickedItems())}
          verb="delete"
        />
      )}

      {capturePrompt.pending && (
        <DescribeCapture
          onCancel={capturePrompt.cancel}
          onSubmit={capturePrompt.submit}
          resource={capturePrompt.pending}
        />
      )}

      {troubles.length > 0 && (
        <ul className="troubles">
          {troubles.map((trouble) => (
            <li key={trouble.id}>
              {trouble.message}
              <button onClick={() => errors.dismiss(trouble.id)} type="button">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The view a toggle lands on — there are only ever two. */
function otherViewMode(mode: ViewMode): ViewMode {
  return mode === "canvas" ? "list" : "canvas";
}

/** An item is "still blank" when nothing has been said about it — what
 * decides whether a still-new item, once it falls off the trail, is
 * worth keeping (`arriveAt`) rather than discarded. */
function isBlankDraft(item: Item): boolean {
  return (
    item.name.trim() === "" &&
    !item.display_name &&
    !item.type &&
    item.resources.length === 0 &&
    item.metadata.length === 0 &&
    pool.connectionsTouching(item.id).length === 0
  );
}

/**
 * What the prompt asks. It names the one thing when there is only one,
 * because "delete 1 item" is how a program talks about a thing and not
 * how a person does.
 */
function deleteQuestion(picked: Item[]): string {
  const deletable = picked.filter((item) => !item.system);
  if (deletable.length === 1) {
    const only = deletable[0] as Item;
    return `Delete ${captionOf(only) ? `“${captionOf(only)}”` : "this item"}?`;
  }
  return `Delete ${deletable.length} items?`;
}
