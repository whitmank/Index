// Authored by Karter Whitman using Claude Opus 4.8
// Placeholder shell. The real shell (set switcher, view-kind switcher,
// undo indicators — PRODUCT-SPEC §3.1) arrives in phase 5; until then
// this only proves the renderer is alive and the bridge is reachable.
export function App() {
  const bridge = typeof window.index === "undefined" ? "absent" : "ready";
  return (
    <main className="placeholder">
      <h1>Index</h1>
      <p>bridge: {bridge}</p>
    </main>
  );
}
