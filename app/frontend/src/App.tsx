// Authored by Karter Whitman using Claude Opus 5
// The shell: a trail that says where you are (top-left), a view switcher
// that says how you're looking at it (top-right), and one surface at a
// time on the stage — the home screen when you are nowhere in particular,
// otherwise the place you walked to, plus the focus overlay above either.
//
// There is one navigation primitive: `goTo`. A place you enter, a thing
// you open. Which one an item is comes from the pool, and the views draw
// the difference so the same click never surprises you.
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { ViewKind } from "@index/database/types";
import { DebugPanel } from "./debug/DebugPanel.tsx";
import {
  Checks,
  checkCanvas,
  checkFocus,
  checkList,
  checkNavigation,
  checkTimeline,
} from "./debug/uiChecks.js";
import { useUndoRedo } from "./hooks/useUndoRedo.ts";
import { captionOf } from "./lib/derive.js";
import { HOME_SET_ID } from "./lib/seeds.js";
import { VIEW_KINDS, viewKindOf } from "./lib/sets.js";
import { errors, loadItem, loadSet, pool, usePool, useTroubles } from "./store/index.js";
import { Canvas } from "./views/canvas/Canvas.tsx";
import { Focus } from "./views/focus/Focus.tsx";
import { Home } from "./views/home/Home.tsx";
import { List } from "./views/list/List.tsx";
import { Timeline } from "./views/timeline/Timeline.tsx";
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
  const troubles = useTroubles();

  const currentSetId = path[path.length - 1] ?? null;

  // The trail, resolved to records so the crumbs can name themselves.
  const crumbs = usePool(() => path.map((id) => ({ id, item: pool.getItem(id) })));

  /** Walk into a place: it becomes the last crumb, shown in the view it
   * opens into. Going somewhere already on the trail truncates back to it
   * rather than pushing a second copy. */
  const enter = useCallback((id: string) => {
    setPath((current) => {
      const at = current.indexOf(id);
      return at === -1 ? [...current, id] : current.slice(0, at + 1);
    });
    const item = pool.getItem(id);
    setKind(item ? viewKindOf(item) : "timeline");
    setOpened(null);
  }, []);

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

  // Every crumb has to be able to name itself, however you arrived —
  // walked in, forced by an env var, or restored on the trail.
  useEffect(() => {
    for (const id of path) {
      if (!pool.getItem(id)) void loadItem(id);
    }
  }, [path]);

  // Canvas and list show the whole set at once; the timeline loads its own
  // pages. Nothing to load on the home screen.
  useEffect(() => {
    if (!currentSetId || kind === "timeline") return;
    void loadSet(currentSetId).then(setMemberIds);
  }, [currentSetId, kind]);

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
          <Canvas itemIds={memberIds} onGoTo={goTo} setId={currentSetId} />
        )}
        {currentSetId && kind === "list" && (
          <List itemIds={memberIds} onGoTo={goTo} setId={currentSetId} />
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
