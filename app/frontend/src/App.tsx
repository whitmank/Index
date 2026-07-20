// Authored by Karter Whitman using Claude Opus 4.8
// Placeholder shell. The real shell (set switcher, view-kind switcher,
// undo indicators — PRODUCT-SPEC §3.1) arrives in phase 5; until then
// this hosts the debug panel, and binds the undo/redo keys the whole app
// will use.
import { DebugPanel } from "./debug/DebugPanel.tsx";
import { useUndoRedo } from "./hooks/useUndoRedo.ts";

export function App() {
  useUndoRedo();

  if (typeof window.index === "undefined") {
    return (
      <main className="placeholder">
        <h1>Index</h1>
        <p className="check-line">bridge: absent</p>
      </main>
    );
  }

  return (
    <main className="placeholder">
      <h1>Index</h1>
      <DebugPanel />
    </main>
  );
}
