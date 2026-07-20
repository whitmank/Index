// Authored by Karter Whitman using Claude Opus 4.8
// The shell: exactly one view at a time, plus the overlay surfaces
// (PRODUCT-SPEC §3.1). Phase 5 gives the top bar its set switcher and
// undo indicators; the view-kind switcher is here already, because a view
// nobody can reach isn't finished.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ViewKind } from "@index/database/types";
import { DebugPanel } from "./debug/DebugPanel.tsx";
import { Checks, checkCanvas, checkFocus, checkList, checkTimeline } from "./debug/uiChecks.js";
import { useUndoRedo } from "./hooks/useUndoRedo.ts";
import { HOME_SET_ID } from "./lib/seeds.js";
import { errors, loadSet, pool, useTroubles } from "./store/index.js";
import { Canvas } from "./views/canvas/Canvas.tsx";
import { Focus } from "./views/focus/Focus.tsx";
import { List } from "./views/list/List.tsx";
import { Timeline } from "./views/timeline/Timeline.tsx";
import "./views/canvas/Canvas.css";
import "./views/focus/Focus.css";
import "./views/list/List.css";
import "./views/timeline/Timeline.css";

const VIEW_KINDS: ViewKind[] = ["timeline", "canvas", "list"];

export function App() {
  useUndoRedo();

  // VITE_INDEX_VIEW picks the view to open on, for looking at one
  // without clicking; the launch state is otherwise the timeline.
  const [kind, setKind] = useState<ViewKind>(
    (VIEW_KINDS as string[]).includes(import.meta.env.VITE_INDEX_VIEW ?? "")
      ? (import.meta.env.VITE_INDEX_VIEW as ViewKind)
      : "timeline",
  );
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [opened, setOpened] = useState<{ id: string; isNew: boolean } | null>(null);
  const troubles = useTroubles();

  const open = useCallback((item: { id: string }, isNew?: boolean) => {
    setOpened({ id: item.id, isNew: Boolean(isNew) });
  }, []);

  // Canvas and list show the whole set; the timeline loads its own pages.
  useEffect(() => {
    if (kind === "timeline") return;
    void loadSet(HOME_SET_ID).then(setMemberIds);
  }, [kind]);

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
        <span className="bar-set">~</span>

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
      </header>

      <div className="stage">
        {kind === "timeline" && <Timeline onOpen={open} setId={HOME_SET_ID} />}
        {kind === "canvas" && <Canvas itemIds={memberIds} onOpen={open} setId={HOME_SET_ID} />}
        {kind === "list" && <List itemIds={memberIds} onOpen={open} setId={HOME_SET_ID} />}
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
