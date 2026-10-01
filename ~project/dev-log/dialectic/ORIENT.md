---
updated: 2026-03-17
session: "031"
authored_by: Claude Sonnet 4.6
---

## Conceptual Context

Index is a semantic layer over a file system. The organizing principle is *meaning over location*: objects exist in multiple contexts simultaneously through tags and containers. The app manages references, never copies. Local-first means data lives with the user — organized around user identity, not a single machine.

A container is an object with `container: true`. It has a membership defined by:
- **query** — tag rules (`all`/`any`/`none`) evaluated dynamically
- **contains edges** — explicit inclusions (ordered)
- **excludes edges** — explicit exclusions

Membership = `(query_results ∪ contains_edges) − excludes_edges`. Containers and leaf objects are the same primitive; the `container: bool` flag is the only affordance marker.

The active container is the capture target. Capturing content (CMD+I) imports the object into whichever container is currently active.

## Technical Context

v0.4 backend: persistent SurrealDB at `~/.index/surreal/`. Four edge tables (`tagged`, `contains`, `excludes`, `typed`) replace all join tables. No `spaces` table — containers are rows in `objects`. LIVE SELECT pushes diffs to renderer on seven tables: `objects`, `tagged`, `contains`, `excludes`, `tag_definitions`, `typed`, and implicitly `tag_types` via `_reloadTagTypes`.

Two system containers with fixed IDs (seeded in `initializeTables`):
- `objects:root` — root view. Never shown in UI; its `contains` edges define what appears at `/`.
- `objects:all` — navigable "all content" space. Auto-pinned to root via a `root→contains→all` edge on first boot.

Single Zustand store (`useIndexStore`). `rootObjects` = evaluated membership of `objects:root`. `spaceObjects` = evaluated membership of active container (null = at root). `evaluateContainer` IPC call does all membership resolution server-side via `container-service.js`.

Frontend: three top-level views — `/` (root/spaces), Tags, Settings. CMD+K (command palette), CMD+L (address bar navigation). Navigation history tracked in store. ObjectListView handles both containers (`▸`, enter-on-double-click) and leaf objects (open detail on double-click).

The AddressBar doubles as the space navigator: CMD+L focuses an in-place input with Tab/Arrow/Enter navigation. `SpaceNavigator` component removed; `addressBarRef.startNavigation()` is the entry point. Root is always navigable as `/` in the address bar.

## Current Synthesis

The unified object/container data model is complete through all layers with no legacy surface area. Spaces terminology is fully retired. `createContainer`, `updateContainer`, `deleteContainer`, `evaluateContainer`, `addContains`/`removeContains`/`addExcludes`/`removeExcludes` are the canonical surface.

Tag types are first-class records in a `tag_types` table. Type membership is a `typed` edge. System types seeded from `SYSTEM_TAG_TYPES` via `UPSERT` on every boot. Untyped tags are valid and group under `∅`.

LIVE SELECT covers all seven tables. Store state is reactive to all mutations without manual synchronization.

Root view (`/`) shows evaluated membership of `objects:root`. `rootObjects` is loaded at startup and kept current by `_reevaluateRoot()` on `onContainsLive` events where `parentId === ROOT_CONTAINER_ID`. Creating a container auto-pins it to root.

Address bar integrates space navigation (formerly a separate `SpaceNavigator` modal).

Codebase is in a clean state. Dead code audit (session 029) removed all stubs, orphaned components, and unimplemented feature placeholders. What exists is what works.

## Key Decisions

- Container = `object { container: true }`. No separate table.
- Pinning = `contains` edge from `objects:root`. No `pinned: bool` field.
- Edge tables (`tagged`, `contains`, `excludes`, `typed`) replace all join tables.
- `objects:root` — system container for root; never shown in UI.
- `objects:all` — navigable system space; seeded at first boot.
- `evaluateContainer` resolves membership server-side via `container-service.js`; called at load and on live events.
- LIVE SELECT on all seven tables; `onContainsLive` re-evaluates root if parent is `objects:root`.
- `scheduleExport()` on all mutations.
- System tag registry centralized in `domain/tag-types.js`; `seedTagTypes(db)` upserts on every boot.
- Tag type = first-class `tag_types` record. Type membership = `typed` edge, not a string field.
- `normalizeRecord` stringifies `in`/`out` edge fields alongside `id`.
- CMD+K = command interface; CMD+L = address bar navigation (replaces SpaceNavigator modal).
- Navigation history in store (`navHistory`/`navCursor`); `_activateSpace` bypasses history for back/forward.
- Active container as capture target — overlay priority over main window.
- `createContainer` auto-pins new containers to root via `addContains(ROOT_CONTAINER_ID, newId)`.

## Open Contradictions

**QuickSpaceView is a near-empty shell.** The overlay window exists and opens, but navigation is unimplemented — `handleEnterSpace` and its dead wiring were removed in session 029. The overlay shows an empty graph and a command palette with no space-navigation commands. Its intended behavior (graph view of active container, command-driven navigation) is the next forward surface.
