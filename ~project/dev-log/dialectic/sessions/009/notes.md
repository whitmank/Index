---
session: 009
timestamp: 2026-03-26T02:28:15Z
authored_by: Claude Sonnet 4.6
---

## synthesis — 02:45 UTC

GraphView simulation lifecycle split into three independent effects: mount (SVG skeleton + zoom, once), data (D3 general update with position reconciliation, on objects change), resize (forceCenter nudge). `createForceSimulation` now takes a `getNodes` accessor so the tick's boundary-constraint loop always iterates the live array after `simulation.nodes()` replaces it. Survivors carry x/y/vx/vy/fx/fy forward; zoom state never lost. This resolves the open contradiction — data changes no longer reset the simulation.

