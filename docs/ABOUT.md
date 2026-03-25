---
title: About Index
version: 0.5
date: 2026-03-17
author: Claude Code
---

# Index

Index is a local-first desktop application that creates a semantic layer over files and URLs. The core insight: hierarchical file systems force you to pick *one location* for everything. Index lets objects exist in multiple contexts simultaneously through tags and spaces.

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

The most important architectural pattern: **LIVE SELECT**. SurrealDB pushes diffs to the renderer on every table change. The renderer subscribes once at mount and receives CREATE/UPDATE/DELETE events rather than polling or refetching. This applies to both record tables and edge tables.

---

## Data Model

- **Object** — a file or URL reference. Has sources (URIs), user metadata, and tags. Never duplicates the file — it points. Objects are also the space primitive (see below).
- **Space** — an object with `space: true`. Holds member objects via tag query rules, explicit `contains` edges, and explicit `excludes` edges. No separate table. Spaces are navigable, named contexts that users can enter and organize.
- **Tag** — flat, many-to-many. Both user-defined and system-derived. Assignment is a `tagged` edge, not a join table record.
- **Tag Type** — a first-class `tag_types` record. Membership expressed as a `typed` edge from `tag_definitions` to `tag_types`. System types: `medium`, `kind`, `file`, `origin`.

---

## Edges

Relationships between records are expressed as SurrealDB `RELATE` edges — typed as `TYPE RELATION`, with their own `id`, `in`, `out` fields, and optional data. Four edge tables are in use:

| Table | Direction | Data |
|---|---|---|
| `tagged` | `objects → tag_definitions` | — |
| `contains` | `objects → objects` | `order` |
| `excludes` | `objects → objects` | — |
| `typed` | `tag_definitions → tag_types` | — |

Edges replace all previous join tables. LIVE SELECT subscriptions run on all four edge tables, keeping the renderer reactive to relationship changes without record rescans.

---

## Key Flows

**Adding an object:** Drop a file or paste a URL → main process creates object in SurrealDB, assigns system tags via `RELATE` edges, schedules export → LIVE SELECT fires → renderer state updates.

**Entering a space:** `db:evaluateSpace(id)` runs the membership formula server-side: `(query_results ∪ contains_edges) − excludes_edges`. Result stored in `activeSpaceObjects`. Re-evaluated on any relevant LIVE SELECT event.

**Capture:** CMD+I global hotkey extracts frontmost browser tab URL/title → creates or updates object → imports into the active space via a `contains` edge.

---

## Frontend State

Single Zustand store (`useIndexStore`) owns: `objects` (all records — both spaces and leaves), `tags`, `tagTypes` (sorted `tag_types` records), `typedEdges`, `rootObjects` (evaluated membership of `objects:root`), `activeSpaceObjects` (evaluated membership of the active space; `null` = home, not in a space), `objectTags` cache, and navigation history.

---

## Key Files

| File | Purpose |
|------|---------|
| `electron/main/index.js` | App lifecycle, hotkeys, startup sequence |
| `electron/main/db/connection.js` | SurrealDB process management, table init, system space seeding |
| `electron/main/db/live-queries.js` | LIVE SELECT subscriptions → renderer push |
| `electron/main/db/export.js` | Async JSON export with debouncing |
| `electron/main/db/migration.js` | v0.3→v0.4 one-time import |
| `electron/main/db/services/object-service.js` | Object creation + system tag assignment via edges |
| `electron/main/db/services/space-service.js` | Space membership evaluation |
| `electron/main/ipc/db-handlers.js` | Full database API (objects, tags, tag types, spaces, edges) |
| `electron/main/domain/tag-types.js` | System tag type registry (`SYSTEM_TAG_TYPES`); `seedTagTypes()` |
| `electron/preload/index.js` | Context bridge (secure IPC surface) |
| `src/store/index.js` | `useIndexStore` — unified state + LIVE SELECT wiring |
| `src/App.jsx` | Root component, mount sequencing, view routing |
| `src/components/ObjectListView.jsx` | List view — spaces and leaf objects |
| `src/components/AddressBar.jsx` | Navigation strip + integrated CMD+L space navigator |
| `src/components/CommandPalette.jsx` | CMD+K command interface |
| `src/components/TagsView.jsx` | Tag management, grouped by type |
| `src/components/CreateSpaceModal.jsx` | Space creation/edit form (tag query builder) |
| `src/components/QuickSpaceView.jsx` | Floating overlay window |
| `src/components/GraphView.jsx` | D3 force-directed visualization (nodes; edges not yet rendered) |

---

## Stack

- **Electron** 39.2.7 — Desktop app, native integration
- **React** 18.2.0 — UI rendering
- **Zustand** 4.4.7 — Lightweight state management
- **SurrealDB** 1.3.2 — Persistent schemaless database with LIVE SELECT and native RELATE edges
- **D3.js** — Force-directed graph visualization
- **Vite** 6.0.0 — Build tool and dev server

---

## Storage Paths

```
~/.index/
├── surreal/               # Persistent SurrealDB (primary source of truth)
├── export/                # Human-readable JSON backup
│   ├── objects/
│   ├── tag_definitions/
│   ├── tag_types/
│   ├── tagged_edges.json
│   ├── contains_edges.json
│   ├── excludes_edges.json
│   └── typed_edges.json
├── .device-id             # Device UUID + name
├── .version               # Written on first v0.4 boot; gates v0.3 migration
└── window-settings.json   # Window state
```

---

## Built vs Not Yet Built

**Built:** Object CRUD, tagging via edges, spaces (query + explicit contains/excludes), tag types as first-class records, D3 force graph (nodes, physics, zoom/drag), capture to active space, device identity, v0.3 migration, async export, LIVE SELECT reactivity on all six tables, command palette, address bar navigation, Quick Space overlay.

**Not yet built:** Undo system (archived), graph edge rendering (relationship data exists; GraphView renders nodes only), object detail view, full-text search, multi-device sync.

---

## Roadmap

### v0.3 (shipped)

- File and URL indexing, multi-source objects, auto-assigned system tags, user tagging
- Force-directed graph visualization
- Global Cmd+I capture, device identification
- Transparent overlay + standard window profiles (macOS)

### v0.4 (shipped)

- Persistent SurrealDB — source of truth; JSON becomes human-readable export
- LIVE SELECT reactivity — UI updates via DB push, no full state reloads
- Edge-based relationships — `tagged`, `contains`, `excludes`, `typed` replace all join tables
- Space model — all organizational units unified into `objects` with `space: true`
- Tag type system — first-class `tag_types` records connected via `typed` edges
- Fully-qualified SurrealDB IDs throughout all layers
- Single unified store (`useIndexStore`), command palette, address bar navigation, Quick Space overlay
- v0.3 → v0.4 one-time migration on first boot

### v0.5 (current)

- Codebase and documentation audit; comment policy established

### Future

- Graph edge rendering (relationship visualization)
- Object detail view
- Undo system
- Chrome/Arc/Firefox capture support
- Full-text search
- Optional sync (local-first, sync-optional model)
