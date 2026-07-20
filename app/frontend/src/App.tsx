// Authored by Karter Whitman using Claude Opus 4.8
// The shell. Phase 5 gives it its real top bar (set switcher, view-kind
// switcher, undo indicators — PRODUCT-SPEC §3.1); for now it loads a set
// and hands it to a view, which is enough to use one.
import { useEffect, useRef, useState } from "react";
import { DebugPanel } from "./debug/DebugPanel.tsx";
import { useUndoRedo } from "./hooks/useUndoRedo.ts";
import { HOME_SET_ID } from "./lib/seeds.js";
import { errors, pool, useTroubles } from "./store/index.js";
import { Checks, checkCanvas, checkFocus, checkTimeline } from "./debug/uiChecks.js";
import { Focus } from "./views/focus/Focus.tsx";
import { Timeline } from "./views/timeline/Timeline.tsx";
import "./views/canvas/Canvas.css";
import "./views/focus/Focus.css";
import "./views/timeline/Timeline.css";

export function App() {
  useUndoRedo();

  const [opened, setOpened] = useState<{ id: string; isNew: boolean } | null>(null);
  const troubles = useTroubles();

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

      </header>

      <div className="stage">
        <Timeline
          onOpen={(item, isNew) => setOpened({ id: item.id, isNew: Boolean(isNew) })}
          setId={HOME_SET_ID}
        />
      </div>

      {opened && (
        <Focus
          isNew={opened.isNew}
          itemId={opened.id}
          key={opened.id}
          onDismiss={() => setOpened(null)}
          // Following a connection opens the item at its far end; the
          // one you came from is not "new", whatever this one was.
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
