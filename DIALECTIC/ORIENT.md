---
updated: 2026-03-16
session: "022"
authored_by: Claude Sonnet 4.6
---

## Conceptual Context

Index is a semantic layer over a file system. The organizing principle is *meaning over location*: objects exist in multiple contexts simultaneously through tags and spaces rather than a single folder hierarchy. The app manages references, never copies. Local-first means data lives with the user — organized around user identity, not a single machine.

A space is a named subset of [all] defined by tag conditions. Spaces have read and write semantics: entering a space shows objects that satisfy its query; placing an object in a space assigns the space's defining (`query.all`) tags to it. Any space can be viewed through any lens — list, calendar, or graph. The Finder analogy: same directory, multiple view types.

The active space is the capture target. Capturing content (CMD+I) imports the object directly into whichever space is currently active — overlay takes priority over main window.

## Technical Context

v0.4 backend is settled: persistent SurrealDB at `~/.index/surreal/` (table: `spaces`), LIVE SELECT reactivity, single Zustand store (`useIndexStore`), async debounced export, centralized system tag domain logic. Fully-qualified SurrealDB IDs throughout all layers. RecordId normalization applied at IPC boundary and within `evaluateSpace` override handling.

Frontend interaction model is substantially built. The app has three top-level views — Spaces, Tags, Settings — navigated via CMD+1/2/3. Two distinct navigation interfaces: CMD+K (command palette, reserved for functional commands) and CMD+L (SpaceNavigator, terminal-style tab completion). Navigation history (`navHistory`/`navCursor`) tracked in store; CMD+A/D and CMD+←/→ traverse it.

ObjectListView supports full Finder-style selection: click, CMD+click, Shift+click range, Delete to remove, WASD/arrow navigation, auto-focus on entry. Double-click fires `onObjectOpen` (stubbed).

Capture (CMD+I) targets the active space via `activeSpaceRegistry` in the main process, updated by `app:setActiveSpace` IPC from each window.

## Current Synthesis

Backend, capture, and list interaction are all functional. The space model is fully implemented with live reactivity. Navigation is clean: two interfaces (command vs. navigate), linear history, keyboard-first.

The next frontier is the object detail view — double-click is wired and waiting. After that: `addObjectToSpace` UI surface, overlay navigation unification (CMD+K/L split), and eventually graph edges.

## Key Decisions

- Persistent SurrealDB over ephemeral.
- LIVE SELECT over polling.
- Single store (`useIndexStore`) over fragmented stores.
- `scheduleExport()` everywhere mutations happen.
- System tag registry centralized in `domain/tag-types.js`.
- Fully-qualified SurrealDB IDs — normalization at emission point and IPC boundary.
- `spaces` table (renamed from `collections`) — total rename at all layers.
- Space write rule: `query.all` tags only. `any`/`none` ignored for write.
- Views architecture: spaces hold objects, views are a lens. Any space, any view type.
- `default_view` on space records; `activeView` in store; store-level only for system spaces.
- CMD+K = command interface; CMD+L = space navigator. Separated concerns.
- Navigation history in store (`navHistory`/`navCursor`); `_activateSpace` bypasses history for back/forward.
- Active space as capture target — overlay priority over main window.
- All top-level destinations are full pages (Spaces, Tags, Settings). No modals in top-level navigation.

## Open Contradictions

- **`display: false` system tags in space builder** — `file_type` and `origin` tags are domain-hidden but appear in CreateSpaceModal's tag pool (raw `tags` array, no display filter).
- **Graph edges absent** — links modeled in data layer, not rendered. Blocked on relationship data model design.
- **Object detail view not built** — `onObjectOpen` prop is wired in ObjectListView but App.jsx stubs it. Detail panel is the next major milestone.
- **`addObjectToSpace` has no UI surface** — write semantic exists in the store; no user-facing affordance.
- **Overlay navigation not unified** — QuickSpaceView still uses compact CommandPalette for space nav; CMD+K/L split not yet applied to overlay.
