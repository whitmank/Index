---
title: About Index
version: 0.4.0
date: 2026-03-11
author: Claude (claude-sonnet-4-6)
---

# Index

Index is a local-first desktop application that creates a semantic layer over files and URLs. The core insight: hierarchical file systems force you to pick *one location* for everything. Index lets objects exist in multiple contexts simultaneously through tags, collections, and explicit relationships.

You manage *what things mean*, not *where they are*. Source files stay where they are; Index points to them.

---

## Architecture

Three-layer: **Main process → IPC bridge → Renderer**

```
Electron Main (SurrealDB, file system, IPC)
        ↕  IPC + LIVE SELECT push
React Renderer (Zustand, D3)
        ↓
~/.index/surreal/  (persistent DB)
~/.index/export/   (human-readable JSON backup)
```

The most important architectural pattern: **LIVE SELECT**. SurrealDB pushes diffs to the renderer on every table change. The renderer subscribes once at mount and receives CREATE/UPDATE/DELETE events rather than polling or refetching.

---

## Data Model

- **Object** — a file or URL reference. Has sources (URIs), user metadata, tags, and a label for graph display. Never duplicates the file — it points.
- **Tag** — flat, many-to-many. Both user-defined and system-derived (media type, file type, device origin).
- **Collection** — a saved tag query (AND/OR/NOT logic). Auto-evaluates. Includes a synthetic "ALL" collection.
- **Link** — explicit typed relationship between objects. Currently modeled, not yet visualized.

System tags are derived automatically from sources and managed by a central registry (`domain/tag-types.js`) — the single source of truth for what's editable, deletable, displayable.

---

## Key Flows

**Adding an object:** Drop a file or paste a URL → main process creates object in SurrealDB, assigns system tags, schedules export → LIVE SELECT fires → renderer state updates.

**Filtering:** Activate a collection → `evaluateCollection()` runs server-side query → `getDisplayObjects()` selector returns matching subset.

**Capture:** `Cmd+I` global hotkey extracts frontmost browser tab URL/title → creates or updates object → selects it in the graph.

**Undo:** Every destructive action pushes `{ description, undo fn }` to history store. Toast shows; `Cmd+Z` pops and executes inverse.

---

## Frontend State

Single Zustand store (`useIndexStore`) owns: objects, collections, tags, tag-type registry, a lazy-loaded objectTags cache, and the active collection filter. A second store (`useHistoryStore`) is the undo stack, capped at 20.

---

## Key Files

| File | Purpose |
|------|---------|
| `electron/main/index.js` | App lifecycle, hotkeys, startup sequence |
| `electron/main/db/connection.js` | SurrealDB process management |
| `electron/main/db/live-queries.js` | LIVE SELECT subscriptions to renderer |
| `electron/main/db/export.js` | Async JSON export with debouncing |
| `electron/main/db/migration.js` | v0.3→v0.4 one-time import |
| `electron/main/db/services/object-service.js` | Object creation + system tag assignment |
| `electron/main/ipc/db-handlers.js` | Database API handlers |
| `electron/main/domain/tag-types.js` | System tag type registry |
| `electron/preload/index.js` | Context bridge (secure IPC surface) |
| `src/store/index.js` | useIndexStore (unified state) |
| `src/store/history.js` | useHistoryStore (undo stack) |
| `src/App.jsx` | Root component, mount sequencing |
| `src/components/GraphView.jsx` | D3 force-directed visualization |
| `src/components/ObjectDetailSidebar.jsx` | Object editor |
| `src/components/CollectionsSidebar.jsx` | Collections manager |
| `src/components/UndoToast.jsx` | Undo notification UI |
| `src/hooks/useKeyboardShortcuts.js` | Global hotkey handler |

---

## Stack

- **Electron** 39.2.7 — Desktop app, native integration
- **React** 18.2.0 — UI rendering
- **Zustand** 4.4.7 — Lightweight state management
- **SurrealDB** 1.3.2 — Persistent schemaless database with LIVE SELECT
- **D3.js** — Force-directed graph visualization
- **Vite** 6.0.0 — Build tool and dev server

---

## Storage Paths

```
~/.index/
├── surreal/              # Persistent SurrealDB
├── export/               # Human-readable JSON backup
│   ├── objects/
│   ├── tag_definitions/
│   ├── collections/
│   └── tag_assignments.json
├── .device-id            # Device UUID + name
├── .version              # Migration marker (v0.3→v0.4)
└── window-settings.json  # Window state
```

---

## Built vs Sketched

**Built:** Object CRUD, tagging, collections, D3 force graph (nodes, physics, zoom/drag), undo, capture, device identity, v0.3 migration, async export, LIVE SELECT reactivity.

**Modeled, not yet rendered:** Graph edges (relationships exist in data model, not yet in GraphView), full-text search, multi-device sync.

---

## Roadmap

### v0.3 (shipped)

- File (`file://`) and URL (`https://`) indexing
- Multi-source objects — one object, many locations/devices
- Auto-assigned system tags (`media_type`, `file_type`, `origin`)
- User tagging with collections (saved AND/OR/NOT queries)
- Force-directed graph visualization (D3)
- Object detail sidebar (inline editing, sources, tags)
- Global Cmd+I capture (Safari integration)
- File recovery via content hashing
- Device identification (named devices, origin tracking)
- Keyboard-driven interface
- Transparent overlay + standard window profiles (macOS)

### v0.4 (current)

Architecture overhaul:

- Persistent SurrealDB — source of truth at `~/.index/surreal/`; JSON becomes human-readable export
- LIVE SELECT reactivity — UI updates via DB push, no full state reloads
- Domain centralization — tag type rules owned by `domain/tag-types.js`, not UI components
- Fully-qualified SurrealDB IDs (`table:id`) throughout all layers
- Single unified store (`useIndexStore`) replacing three fragmented stores
- Undo system — `UndoToast` + `useHistoryStore` wired to all destructive actions
- v0.3 → v0.4 one-time migration on first boot

### Future

- Relationship visualization (edges in graph)
- Collection filtering wired end-to-end
- Chrome/Arc/Firefox capture support
- Tag autocomplete and color-in-graph
- Full-text search
- Optional sync (local-first, sync-optional model)
- Plugin system for custom source handlers
