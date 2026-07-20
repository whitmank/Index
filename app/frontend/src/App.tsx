// Authored by Karter Whitman using Claude Opus 4.8
// The shell. Phase 5 gives it its real top bar (set switcher, view-kind
// switcher, undo indicators — PRODUCT-SPEC §3.1); for now it loads a set
// and hands it to a view, which is enough to use one.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Item } from "@index/database/types";
import { DebugPanel } from "./debug/DebugPanel.tsx";
import { useUndoRedo } from "./hooks/useUndoRedo.ts";
import { HOME_SET_ID } from "./lib/seeds.js";
import { errors, loadSet, useTroubles } from "./store/index.js";
import { Checks, checkCanvas } from "./debug/uiChecks.js";
import { Canvas } from "./views/canvas/Canvas.tsx";
import "./views/canvas/Canvas.css";

export function App() {
  useUndoRedo();

  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [opened, setOpened] = useState<Item | null>(null);
  const troubles = useTroubles();

  const reload = useCallback(async () => {
    setMemberIds(await loadSet(HOME_SET_ID));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // VITE_INDEX_UICHECK drives the real UI with synthetic gestures once the
  // view is up, and reports through the forwarded console.
  const checked = useRef(false);
  useEffect(() => {
    if (!import.meta.env.VITE_INDEX_UICHECK || checked.current || memberIds.length === 0) return;
    checked.current = true;
    void (async () => {
      const checks = new Checks();
      await checkCanvas(HOME_SET_ID, checks);
      console.log(
        checks.failures
          ? `${checks.failures} of ${checks.lines.length} ui checks failed`
          : `all ${checks.lines.length} ui checks passed`,
      );
    })();
  }, [memberIds]);

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
        <button className="bar-action" onClick={() => void reload()} type="button">
          reload
        </button>
      </header>

      <div className="stage">
        <Canvas itemIds={memberIds} onOpen={setOpened} setId={HOME_SET_ID} />
      </div>

      {opened && (
        <div className="stub" onClick={() => setOpened(null)} role="presentation">
          <p>
            focus view arrives next — {opened.display_name ?? (opened.name || "unnamed item")}
          </p>
        </div>
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
