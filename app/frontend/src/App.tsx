// Authored by Karter Whitman using Claude Opus 4.8
// Placeholder shell. The real shell (set switcher, view-kind switcher,
// undo indicators — PRODUCT-SPEC §3.1) arrives in phase 5; until then
// this hosts the bridge check that phase 2 is verified by.
import { BridgeCheck } from "./BridgeCheck.tsx";

const samplePath = import.meta.env.VITE_INDEX_SAMPLE_IMAGE ?? null;

export function App() {
  return (
    <main className="placeholder">
      <h1>Index</h1>
      {typeof window.index === "undefined" ? (
        <p className="check-line">bridge: absent</p>
      ) : (
        <BridgeCheck samplePath={samplePath} />
      )}
    </main>
  );
}
