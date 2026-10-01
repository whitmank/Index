# Dev Log — v0.3 Review & Wrap-up
<!-- Author: Claude Code -->
**Date:** 2026-03-10
**Branch:** 0.3
**Session type:** Code review, architectural planning, documentation

---

## Objectives

Wrap up v0.3: thorough code review, architectural analysis, documentation tidy, and planning for v0.4.

---

## Code Review — Bugs Fixed

Systematic review of the codebase produced a prioritized list of issues. All "fix before v0.3 tag" and "cleanup" items were addressed.

### Correctness Fixes

**Origin casing inconsistency (`'web'` vs `'Web'`)**
Pasted URLs constructed `origin: 'web'` (lowercase) while `determineOrigin()` and the capture system used `'Web'`. Would have created two separate system tags for the same concept. Fixed by normalizing source origins inside `db:createObject` IPC handler using `determineOrigin()` — main process is now authoritative for origin conventions, renderer can pass any casing.

**`addObject` undefined in delete-undo closure**
`ObjectDetailSidebar.jsx` `handleDelete` pushed an undo closure that called `addObject(snapshot)`, but `addObject` was never imported or declared in that component. Undo for object deletion was silently broken. Fixed to `useObjectsStore.getState().addObject(snapshot)` — consistent with the existing pattern in the same function.

**`activate` event not updating `mainWindow` reference**
On macOS, if the user closes the window and re-opens via dock click, `app.on('activate')` called `createWindow()` but not `setMainWindow()`. The IPC broadcast reference in `db-handlers.js` would point at the destroyed window. Fixed by adding `setMainWindow(mainWindow)` to the `activate` handler.

**`before-quit` double-quit loop**
If `stopDatabase()` threw during shutdown, the catch block called `app.quit()` — which re-triggered `before-quit` with `dbStarted` still `true`, creating an infinite loop. Fixed by setting `dbStarted = false` in the catch block before `app.quit()`.

### Security Fixes

**`nodeIntegration: true` in device naming dialog**
The first-run device naming dialog used `nodeIntegration: true, contextIsolation: false` — the exact pattern Electron's security model prohibits. Created `electron/main/windows/device-naming-preload.js` exposing only `window.dialogAPI.submitName()` via contextBridge. Updated dialog window config to `nodeIntegration: false, contextIsolation: true` with the new preload. Updated inline HTML script to use `window.dialogAPI` instead of `require('electron')`.

### Reliability Fixes

**IPC listener accumulation**
`onObjectsChanged` and `onSelectObject` in the preload used `ipcRenderer.on` without cleanup, accumulating a new listener on every React remount. Fixed with `ipcRenderer.removeAllListeners(channel)` before re-registering — these are treated as "set the handler", not "add a handler".

### Cleanup

- Removed 4 debug `console.log` calls from `tags.js` `loadTagsForObject`; simplified the state-setting to one line
- Removed `deleteAll` action from `useObjectsStore` — dangerous dead code with no UI surface
- Removed no-op `setTimeout(() => {}, 200)` from `db/index.js` after SurrealDB process kill

---

## Architectural Analysis

Full read of every source file. Key findings:

### SurrealDB's Role (v0.3 vs. intended)

SurrealDB runs ephemerally (temp dir), hydrated from JSON files on startup, written back to JSON on every mutation. It acts as a runtime cache for the JSON files — not as a database. Its query language, live queries, and graph traversal capabilities go entirely unused in v0.3.

This is appropriate for early development, but the dual-layer (ephemeral SurrealDB + canonical JSON) is the source of the most complex code: `hydration.js`, `repair.js`, `file-recovery.js`, `watchers/objects.js`, and `persistToIndex()` scattered across every handler.

### Full-Reload Pattern

Every mutation ends with `await useObjectsStore.getState().loadObjects()` — a full fetch of all objects after every change. Correct and simple, but not sustainable and not using SurrealDB's capabilities.

### Business Logic Scattered

System tag rules lived in `TagAssignmentSection.jsx` (a UI component): which tag types can be deleted, which are displayed, display order, label formatting. These are domain rules that belong in the backend.

### ID Normalization Everywhere

SurrealDB returns IDs as `RecordId` objects (`{ id: "uuid" }`). The pattern `obj.id?.id || obj.id` appeared in 6+ places across components and stores — a leaky abstraction from the DB layer bleeding through to the UI.

---

## Architectural Decisions for v0.4

After analysis, two major architectural directions were chosen:

### 1. SurrealDB as Persistent Store

SurrealDB will point at `~/.index/surreal/` (persistent) instead of a temp dir. JSON files become a human-readable export layer, not the source of truth. This eliminates: startup hydration, repair logic, file watcher, crash-loss window, and the entire dual-layer mental model.

One-time migration on first v0.4 launch reads v0.3 JSON files and imports into SurrealDB.

### 2. LIVE SELECT for Reactive UI

SurrealDB's `LIVE SELECT` pushes diffs to subscribers when records change. The main process subscribes to `objects`, `tag_assignments`, and `collections` at startup and broadcasts diffs to the renderer via `webContents.send('live:objects', { action, result })`. Stores apply granular patches — no full reloads.

JSON export runs on a debounced background timer (5s after last mutation) and on `before-quit`. `persistToIndex()` is removed from all mutation handlers.

---

## v0.4 Architecture Document

Created `docs/feature-dev/ARCHITECTURE_v0.4.md` covering:

- Persistent SurrealDB storage + v0.3 migration path
- LIVE SELECT reactive UI pattern (main process subscription, preload channels, store patch handlers)
- Async JSON export (debounced background, on-quit, on-demand)
- Domain centralization: tag type registry as first-class backend data (`tag-types.js`)
- Zustand store consolidation: three stores → one `useIndexStore` with live subscriptions wired once
- Undo system: full coverage of destructive operations, toast feedback, LIVE SELECT-aware closures
- ID normalization at IPC boundary (`normalizeRecord()` utility)
- 7-phase implementation plan with success criteria

---

## Documentation Updates

### Rewritten

- **`GLOSSARY.md`** — Complete rewrite. Was describing v0.1 data model (`source_local`/`source_remote`, single source URI). Now reflects v0.3 accurately: v2 sources array schema, system tags, device identity, current IPC API, current UI components and shortcuts.

- **`BACKLOG.md`** — Cleared all implemented items (tagging, collections, graph, detail panel, settings). Restructured around actual remaining work. Added v0.4 Architecture section at top as highest-priority items.

- **`QUICKSTART.md`** — Fixed data storage paths (was wrong), removed references to non-existent docs (`docs/PHASE_1_PLAN.md`, `docs/0 - CORE/`), expanded project structure to reflect all actual directories, added macOS Automation permission note for capture.

### Updated

- **`PROJECT_DESIGN.md`** — Updated data model section (sources array), fixed persistence paths, rewrote v0.3/v0.4 roadmap sections, updated "Why SurrealDB?" rationale to reflect the persistent store decision.

### feature-dev/ Cleanup

All feature-dev planning documents were deleted — their purpose is served (implemented or superseded). Only `ARCHITECTURE_v0.4.md` remains.

Deleted:
- `DATA_MODEL.md` (v1, entirely superseded)
- `DATA_MODEL_v2.md` (implemented; code is now the reference)
- `GRAPH_VISUALIZATION_PLAN.md` (implemented)
- `IMPLEMENTATION_PLAN_v2.md` (complete; superseded by ARCHITECTURE_v0.4.md)
- `MACOS_WINDOW_API.md` (reference notes, value served)
- `MACOS_WINDOW_NOTES.md` (reference notes, value served)

---

## Simplification Work

Two v0.3 cleanup items from the architectural analysis were executed:

### Remove `db:query` / `db:mutate` pass-through

Raw SQL IPC handlers allowed the renderer to send arbitrary SurrealQL directly to the database, bypassing all business logic and security constraints. No renderer code was actually using them. Removed from `db-handlers.js` and `preload/index.js`. The only remaining `db.mutate` call (in `deleteObject` store action) was replaced with a new typed `db:deleteObject` handler.

### Delete `metadata.js`

Legacy v1 metadata module (379 lines) with `deriveSourceMetadata`, `cleanURI`, `extractMediaType`, `extractFileExtension` — all superseded by `metadata-extractor.js`. Its only consumer was a dead legacy branch in `db-handlers.js` `updateObject` that handled the old v1 `source` field (not even properly imported — would have thrown `ReferenceError` if reached). Both the branch and the file deleted.

---

## Files Changed

| File | Change |
|---|---|
| `electron/main/ipc/db-handlers.js` | Remove `db:query`/`db:mutate` handlers; remove legacy `source` branch; add `db:deleteObject`; normalize sources in `db:createObject` |
| `electron/preload/index.js` | Remove `query`/`mutate` from bridge; add `deleteObject`; fix listener accumulation |
| `electron/main/index.js` | Fix `activate` handler; fix `before-quit` double-quit |
| `electron/main/windows/device-naming-dialog.js` | Switch to contextBridge preload |
| `electron/main/windows/device-naming-preload.js` | New file — minimal preload for dialog |
| `electron/main/utils/metadata.js` | Deleted |
| `electron/main/db/index.js` | Remove no-op setTimeout |
| `src/store/objects.js` | Remove `deleteAll`; use `db.deleteObject` typed handler |
| `src/store/tags.js` | Remove debug console.logs |
| `src/components/ObjectDetailSidebar.jsx` | Fix `addObject` in undo closure |
| `docs/GLOSSARY.md` | Complete rewrite for v0.3 |
| `docs/BACKLOG.md` | Reconciled against v0.3 actual state |
| `docs/PROJECT_DESIGN.md` | Data model, roadmap, SurrealDB rationale updated |
| `docs/QUICKSTART.md` | Paths, structure, references corrected |
| `docs/feature-dev/ARCHITECTURE_v0.4.md` | New — 7-phase v0.4 architecture plan |
| `docs/feature-dev/DATA_MODEL.md` | Deleted |
| `docs/feature-dev/DATA_MODEL_v2.md` | Deleted |
| `docs/feature-dev/GRAPH_VISUALIZATION_PLAN.md` | Deleted |
| `docs/feature-dev/IMPLEMENTATION_PLAN_v2.md` | Deleted |
| `docs/feature-dev/MACOS_WINDOW_API.md` | Deleted |
| `docs/feature-dev/MACOS_WINDOW_NOTES.md` | Deleted |
