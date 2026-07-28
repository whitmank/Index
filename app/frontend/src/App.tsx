// Authored by Karter Whitman using Claude Opus 4.8
// The shell: an address bar that says where you are (top-left), a view
// switcher that says how you're looking at it (top-right), and one surface
// at a time on the stage — the home screen when you are nowhere in
// particular, otherwise the current set in its chosen view, plus the focus
// overlay above either (PRODUCT-SPEC §3.1).
import { useCallback, useEffect, useRef, useState } from "react";
import type { ViewKind } from "@index/database/types";
import { DebugPanel } from "./debug/DebugPanel.tsx";
import { Checks, checkCanvas, checkFocus, checkList, checkTimeline } from "./debug/uiChecks.js";
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

  // `null` current set means the home screen — you are nowhere in
  // particular, looking at the list of everywhere you could go.
  const [currentSetId, setCurrentSetId] = useState<string | null>(
    startsInHomeSet ? HOME_SET_ID : null,
  );
  const [kind, setKind] = useState<ViewKind>(forcedView ?? "timeline");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [opened, setOpened] = useState<{ id: string; isNew: boolean } | null>(null);
  const troubles = useTroubles();

  const currentSet = usePool(() => (currentSetId ? pool.getItem(currentSetId) : null));

  const open = useCallback((item: { id: string }, isNew?: boolean) => {
    setOpened({ id: item.id, isNew: Boolean(isNew) });
  }, []);

  /** Enter a set: show it in the view it opens into, and make sure the set
   * record itself is in the pool so the address bar can name it. */
  const enterSet = useCallback((setId: string) => {
    const set = pool.getItem(setId);
    setCurrentSetId(setId);
    setKind(set ? viewKindOf(set) : "timeline");
    if (!set) void loadItem(setId);
  }, []);

  const goHome = useCallback(() => setCurrentSetId(null), []);

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
      await checkCanvas(HOME_SET_ID, checks);
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
        <div className="bar-address">
          <button
            className={currentSetId ? "bar-home" : "bar-home is-here"}
            onClick={goHome}
            title="All sets"
            type="button"
          >
            ⌂
          </button>
          {currentSet && (
            <>
              <span className="bar-sep">/</span>
              <span className="bar-set">{captionOf(currentSet) || "untitled"}</span>
            </>
          )}
        </div>

        {currentSetId && (
          <nav className="bar-views">
            {VIEW_KINDS.map((candidate) => (
              <button
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
        {!currentSetId && <Home onEnter={enterSet} />}
        {currentSetId && kind === "timeline" && <Timeline onOpen={open} setId={currentSetId} />}
        {currentSetId && kind === "canvas" && (
          <Canvas itemIds={memberIds} onOpen={open} setId={currentSetId} />
        )}
        {currentSetId && kind === "list" && (
          <List itemIds={memberIds} onOpen={open} setId={currentSetId} />
        )}
      </div>

      {opened && (
        <Focus
          isNew={opened.isNew}
          itemId={opened.id}
          key={opened.id}
          onDismiss={() => setOpened(null)}
          // Following a connection opens the item at its far end; the one
          // you came from is not "new", whatever this one was.
          onNavigate={(itemId) => setOpened({ id: itemId, isNew: false })}
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
