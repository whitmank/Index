// Authored by Karter Whitman using Claude Opus 5
// The shell: a trail that says where you are (top-left), a view switcher
// that says how you're looking at it (top-right), and one surface at a
// time on the stage — the home screen when you are nowhere in particular,
// otherwise the place you walked to, plus the focus overlay above either.
//
// There is one navigation primitive: `goTo`. A place you enter, a thing
// you open. Which one an item is comes from the pool, and the views draw
// the difference so the same click never surprises you.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Item, ViewKind } from "@index/database/types";
import { apply, changes } from "./changes/index.js";
import { commandsFor } from "./commands/index.js";
import { CommandBar } from "./components/CommandBar.tsx";
import { Confirm } from "./components/Confirm.tsx";
import { DebugPanel } from "./debug/DebugPanel.tsx";
import {
  Checks,
  checkCanvas,
  checkCommandBar,
  checkDeleteKeys,
  checkFocus,
  checkList,
  checkNavigation,
  checkPointing,
  checkRemoveFromSet,
  checkSelection,
  checkTimeline,
} from "./debug/uiChecks.js";
import { useSelectionKeys } from "./hooks/useSelectionKeys.ts";
import { useUndoRedo } from "./hooks/useUndoRedo.ts";
import { captionOf } from "./lib/derive.js";
import { HOME_SET_ID } from "./lib/seeds.js";
import { holdsEverything, VIEW_KINDS, viewKindOf } from "./lib/sets.js";
import {
  errors,
  loadItem,
  loadSet,
  pool,
  selection,
  usePool,
  useSelection,
  useTroubles,
} from "./store/index.js";
import { Canvas } from "./views/canvas/Canvas.tsx";
import { Focus } from "./views/focus/Focus.tsx";
import { Home } from "./views/home/Home.tsx";
import { List } from "./views/list/List.tsx";
import { Timeline } from "./views/timeline/Timeline.tsx";
import "./components/CommandBar.css";
import "./components/Confirm.css";
import "./views/canvas/Canvas.css";
import "./views/focus/Focus.css";
import "./views/home/Home.css";
import "./views/list/List.css";
import "./views/timeline/Timeline.css";

export function App() {
  useUndoRedo();

  // VITE_INDEX_VIEW forces a view (and, with it, entry into `~`) for
  // looking at one without clicking; the ui checks likewise expect to run
  // inside `~`. Both bypass the home screen the ordinary launch lands on.
  const forcedView = (VIEW_KINDS as string[]).includes(import.meta.env.VITE_INDEX_VIEW ?? "")
    ? (import.meta.env.VITE_INDEX_VIEW as ViewKind)
    : null;
  const startsInHomeSet = forcedView !== null || Boolean(import.meta.env.VITE_INDEX_UICHECK);

  // The trail of places walked into. Empty means the home screen — you are
  // nowhere in particular, looking at the list of everywhere you could go.
  const [path, setPath] = useState<string[]>(startsInHomeSet ? [HOME_SET_ID] : []);
  const [kind, setKind] = useState<ViewKind>(forcedView ?? "timeline");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [opened, setOpened] = useState<{ id: string; isNew: boolean } | null>(null);
  const [commanding, setCommanding] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const troubles = useTroubles();

  const currentSetId = path[path.length - 1] ?? null;

  /** The set on the stage, when there is one — what "remove from" means. */
  const currentSet = usePool(() => (currentSetId ? (pool.getItem(currentSetId) ?? null) : null));

  // The trail, resolved to records so the crumbs can name themselves.
  const crumbs = usePool(() => path.map((id) => ({ id, item: pool.getItem(id) })));

  /**
   * Who holds an arrow into the set on the stage. Membership is the union
   * of a query and these arrows, so when this changes — by a removal, an
   * undo, or another window — who is in the set may have changed and the
   * view has to read it again. It is the *sources*, not the arrows: a
   * drag writes a position onto an arrow that is already there, and must
   * not reload the canvas out from under the hand doing the dragging.
   */
  const membership = usePool(() =>
    currentSetId
      ? pool
          .arrowsInto(currentSetId)
          .map((arrow) => arrow.source)
          .sort()
          .join(" ")
      : "",
  );

  // Canvas and list show the whole set at once; the timeline loads its own
  // pages. Nothing to load on the home screen — and the actions below
  // need it too, since taking members out means reading who is left.
  const readMembers = useCallback(() => {
    if (!currentSetId || kind === "timeline") return;
    void loadSet(currentSetId).then(setMemberIds);
    // `membership` is not read here; it is a dependency so that a change
    // to who is in the set re-runs this, whoever made that change.
  }, [currentSetId, kind, membership]);

  /** Arrive at a place on the given trail, in the view it opens into.
   * Every way of getting somewhere ends here; they differ only in the
   * trail they claim to have walked. */
  const arriveAt = useCallback((id: string, trail: string[]) => {
    setPath(trail);
    const item = pool.getItem(id);
    setKind(item ? viewKindOf(item) : "timeline");
    setOpened(null);
  }, []);

  /** Walk into a place: it becomes the last crumb. Going somewhere
   * already on the trail truncates back to it rather than pushing a
   * second copy. */
  const enter = useCallback(
    (id: string) => {
      const at = path.indexOf(id);
      arriveAt(id, at === -1 ? [...path, id] : path.slice(0, at + 1));
    },
    [arriveAt, path],
  );

  /** Go straight to a place from the command bar. Unlike entering, this
   * did not walk through anywhere, so it does not claim to have: the
   * trail starts over at the destination — unless you jumped to a place
   * already behind you, which is a walk back. */
  const jump = useCallback(
    (id: string) => {
      const at = path.indexOf(id);
      arriveAt(id, at === -1 ? [id] : path.slice(0, at + 1));
    },
    [arriveAt, path],
  );

  /**
   * The one primitive. A place you enter; a thing you open. An item you
   * just made is always opened, whatever it looks like — you made it to
   * say something about it.
   */
  const goTo = useCallback(
    (item: { id: string }, isNew?: boolean) => {
      if (!isNew && pool.isPlace(item.id)) enter(item.id);
      else setOpened({ id: item.id, isNew: Boolean(isNew) });
    },
    [enter],
  );

  const goHome = useCallback(() => setPath([]), []);

  /**
   * What the command bar hands back: the same primitive as a click, on
   * the far side of a search. A place is jumped to, a thing is opened
   * over wherever you are — you asked to see it, not to move house.
   */
  const goToPicked = useCallback(
    (id: string) => {
      setCommanding(false);
      if (pool.isPlace(id)) jump(id);
      else setOpened({ id, isNew: false });
    },
    [jump],
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
    const set = currentSetId ? pool.getItem(currentSetId) : null;
    if (!set) {
      errors.surface("You are not in a set, so there is nothing to remove these from.");
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

  // The selection's keys are live only while nothing is over the stage:
  // an open focus view, command bar or prompt asked for them first.
  useSelectionKeys(!opened && !commanding && !confirmingDelete, {
    onAskToDelete: askToDeletePicked,
    onRemoveFromSet: removePickedFromSet,
  });

  // ⌘K opens the bar; ⌘F is the same door under the name the spec gave it
  // (§3.7). Both work while typing — reaching for the bar is exactly what
  // you do when what is under your cursor is not what you wanted.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key !== "k" && key !== "f") return;
      event.preventDefault();
      setCommanding((open) => !open);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Every crumb has to be able to name itself, however you arrived —
  // walked in, forced by an env var, or restored on the trail.
  useEffect(() => {
    for (const id of path) {
      if (!pool.getItem(id)) void loadItem(id);
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
      setOpened({ id: match.id, isNew: false });
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
      await checkTimeline(checks);
      await checkCanvas(HOME_SET_ID, checks, setKind);
      await checkNavigation(checks, setKind);
      await checkFocus(checks);
      await checkList(HOME_SET_ID, checks, setKind);
      await checkCommandBar(HOME_SET_ID, checks);
      await checkSelection(checks, setKind);
      await checkRemoveFromSet(checks, setKind);
      await checkDeleteKeys(checks, setKind);
      await checkPointing(checks, setKind);
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
    <div className="shell">
      <header className="bar">
        <nav className="bar-address" aria-label="trail">
          <button
            className={currentSetId ? "bar-home" : "bar-home is-here"}
            onClick={goHome}
            title="All sets"
            type="button"
          >
            ⌂
          </button>

          {crumbs.map(({ id, item }, index) => {
            const last = index === crumbs.length - 1;
            const name = item ? captionOf(item) || "untitled" : "…";
            return (
              <Fragment key={id}>
                <span className="bar-sep">/</span>
                <button
                  aria-current={last ? "page" : undefined}
                  className={last ? "bar-crumb is-here" : "bar-crumb"}
                  onClick={() => (last ? setOpened({ id, isNew: false }) : enter(id))}
                  title={last ? `About ${name}` : `Back to ${name}`}
                  type="button"
                >
                  {name}
                </button>
              </Fragment>
            );
          })}
        </nav>

        <button
          className="bar-goto"
          onClick={() => setCommanding(true)}
          title="Go to… (⌘K)"
          type="button"
        >
          go to…
        </button>

        {currentSetId && (
          <nav className="bar-views" aria-label="view">
            {VIEW_KINDS.map((candidate) => (
              <button
                aria-pressed={candidate === kind}
                className={candidate === kind ? "is-current" : ""}
                key={candidate}
                onClick={() => setKind(candidate)}
                type="button"
              >
                {candidate}
              </button>
            ))}
          </nav>
        )}
      </header>

      <div className="stage">
        {!currentSetId && <Home onEnter={enter} />}
        {currentSetId && kind === "timeline" && <Timeline onGoTo={goTo} setId={currentSetId} />}
        {currentSetId && kind === "canvas" && (
          <Canvas
            itemIds={memberIds}
            onGoTo={goTo}
            onMembersChanged={readMembers}
            setId={currentSetId}
          />
        )}
        {currentSetId && kind === "list" && (
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
          onDismiss={() => setOpened(null)}
          // Following a connection is the same primitive as anywhere else:
          // a place takes you there, a thing swaps the focus to it.
          onGoTo={goTo}
        />
      )}

      {commanding && (
        <CommandBar
          commands={commands}
          onClose={() => setCommanding(false)}
          onPick={goToPicked}
          pickedCount={pickedCount}
        />
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
