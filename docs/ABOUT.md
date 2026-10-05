---
title: About Index
version: 0.6
date: 2026-04-19
author: Claude Opus 4.7
---

# Index

Index is a local-first desktop application that creates a semantic layer over files and URLs. The core insight: hierarchical file systems force you to pick *one location* for everything. Index lets objects exist in multiple contexts simultaneously through edges and spaces.

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

The most important architectural pattern: **LIVE SELECT**. SurrealDB pushes diffs to the renderer on every table change. The renderer subscribes once at mount and receives CREATE/UPDATE/DELETE events rather than polling or refetching. This applies to both node tables and edge tables.

---

## Data Model

0.6 is mid-migration from a partitioned legacy schema toward a unified graph. Both shapes coexist; the legacy shape is authoritative for writes. Phase 3 will drop the legacy tables.

### Legacy shape (authoritative for writes)

- **Object** — a file or URL reference in the `objects` table. Has sources, user metadata, and tags. Objects with `space: true` are spaces — there is no separate space table.
- **Tag** — flat, many-to-many label. Assignment is a `tagged` edge (`objects → tag_definitions`). Both user-defined and system-derived.
- **Tag Type** — a first-class `tag_types` record. Membership expressed as a `typed` edge (`tag_definitions → tag_types`). System types: `medium`, `type`, `file`, `origin`.
- **Device** — a first-class `devices` record. Objects relate to their origin device via `sourced_from` edges.

### New shape (readable; grown via dual-write)

- **Object** — *everything* is an Object in one `objects` table: leaf records, spaces, devices, value Objects (e.g. `objects:⟨andy_weir⟩`), edge Objects (e.g. `objects:⟨author⟩`), and type Objects (e.g. `objects:⟨book⟩`).
- **Edge** — a named relation category. Represented as a SurrealDB RELATION table. Every edge has a twin **edge Object** in `objects` carrying display metadata.
- **Value Object** — target of an edge (e.g. `objects:⟨andy_weir⟩`, `objects:⟨sci_fi⟩`). IDs are slugified `[a-z0-9_]+`.
- **Type Object** — an Object (e.g. `objects:⟨book⟩`) that carries a `schema` array of edge-Object references. `schema` drives pill rendering order in the detail pane.
- **Pill** — the UI representation of one edge instance: `[edge label] : [target name]`.

---

## Edges

### Legacy edge tables (still authoritative)

| Table | Direction | Data |
|---|---|---|
| `tagged` | `objects → tag_definitions` | — |
| `contains` | `objects → objects` | `order` |
| `excludes` | `objects → objects` | — |
| `typed` | `tag_definitions → tag_types` | — |
| `sourced_from` | `objects → devices` | — |

### New per-edge RELATION tables (Phase 2 Stage A+)

One table per edge name. The full registry lives in `electron/main/db/edges.js` (`SYSTEM_EDGES`):

`type`, `author`, `genre`, `published`, `isbn`, `publisher`, `creator`, `captured`, `director`, `released`, `duration`, `artist`, `album`, `medium`, `file`, `origin`, `includes`, `excludes`, `sourced_from`

Each created via `addEdge(name)` — which defines the RELATION table, two indexes (forward unique, reverse), and the twin edge Object in `objects`.

---

## Key Flows

**Adding an object:** Drop a file or paste a URL → main process creates object in SurrealDB, assigns system tags via `RELATE` edges (legacy) + mirrors to per-edge tables (dual-write) → LIVE SELECT fires → renderer state updates.

**Entering a space:** `db:evaluateSpace(id)` runs the membership formula server-side. If the space has a `rule`, `rule-compiler.js` compiles it to SurrealQL; otherwise the legacy `query` (tag-id lists) serves as fallback. Result: `(rule_or_query_matches ∪ contains_edges) − excludes_edges`.

**Pill rendering:** `db:getPillsForObject(id)` queries the new shape via `edge-service.js`. Walks `type` edge → type-Object schema → per-edge tables in schema order. Result cached in `store.pillsForObject`; invalidated by live channels on `tagged` and the pilot per-edge tables (`type`, `author`, `genre`, `published`).

**Capture:** CMD+I global hotkey extracts frontmost browser tab URL/title → creates or updates object → imports into the active space via a `contains` edge.

---

## Frontend State

Single Zustand store (`useIndexStore`) owns: `objects` (all records — both spaces and leaves), `tags`, `tagTypes`, `typedEdges`, `taggedEdges`, `devices`, `objectTags` cache, `pillsForObject` cache (graph-native pill data), `activeSpaceId`, `activeSpaceObjects`, `rootObjects`, and navigation history.

---

## Key Files

### Main process

| File | Purpose |
|------|---------|
| `electron/main/index.js` | App lifecycle, hotkeys, startup sequence |
| `electron/main/db/connection.js` | SurrealDB process management, table init, system space seeding, boot-time device backfill |
| `electron/main/db/edges.js` | `SYSTEM_EDGES` registry; `addEdge`, `removeEdge` helpers |
| `electron/main/db/graph-migration.js` | One-time backfill to new shape; `mirrorTaggedRow`/`unmirrorTaggedRow` dual-write helpers |
| `electron/main/db/rule-compiler.js` | Rule → SurrealQL compiler (validates edge names against `SYSTEM_EDGES`) |
| `electron/main/db/live-queries.js` | LIVE SELECT subscriptions → renderer push (objects + legacy edge tables + pilot per-edge tables) |
| `electron/main/db/export.js` | Async JSON export with debouncing |
| `electron/main/db/migration.js` | v0.3→v0.4 one-time import + legacy schema patches |
| `electron/main/db/repair.js` | System tag repair utility |
| `electron/main/db/surreal-utils.js` | Shared SurrealDB query helpers |
| `electron/main/db/services/edge-service.js` | `getPillsForObject` — new-shape pill reads |
| `electron/main/db/services/object-service.js` | Object creation + system tag assignment + `sourced_from` wiring |
| `electron/main/db/services/space-service.js` | Space membership evaluation (rule + contains − excludes) |
| `electron/main/db/services/device-service.js` | `getOrCreateDevice`, `getDevices`, `setSourcedFromEdges` |
| `electron/main/db/services/system-tags.js` | Find-or-create system tags |
| `electron/main/ipc/db-handlers.js` | Full database IPC façade |
| `electron/main/domain/tag-types.js` | System tag type registry (`SYSTEM_TAG_TYPES`); `seedTagTypes()` |
| `electron/preload/index.js` | Context bridge (secure IPC surface) |

### Renderer

| File | Purpose |
|------|---------|
| `src/store/index.js` | `useIndexStore` — unified state + LIVE SELECT wiring |
| `src/icons/index.jsx` | Shared icon module — `ObjectIcon`, `SpaceIcon`, `MonadIcon`, `TypeIcon`; golden-ratio geometry |
| `src/App.jsx` | Root component, mount sequencing, view routing, filter/sort pref persistence |
| `src/components/ObjectListView.jsx` | List view — two-bit filter state, sort, backtick toggle, per-space pref callbacks |
| `src/components/ObjectDetailPane.jsx` | Detail sidebar — name editing, TypeField, TypeSchemaSection, tag assignment, space rules, pin button, source badge |
| `src/components/TagAssignmentSection.jsx` | Tag assignment UI — renders from `pillsForObject` (new shape); resolves pills back to legacy tag_definitions for mutation IPCs |
| `src/components/TagAddInput.jsx` | Flexible typed/untyped tag input with autocomplete; shared between detail pane and CMD+E modal |
| `src/components/TagEditModal.jsx` | CMD+E modal — space rules, object tag edit, or batch tag edit depending on selection |
| `src/components/SpaceRulesSection.jsx` | Inline space rule editor (stub; Stage B+) |
| `src/components/ObjectCardModal.jsx` | Card-style modal view for an object |
| `src/components/QuickSpaceView.jsx` | Quick-access space overlay |
| `src/components/ObjectSourceView.jsx` | Dispatches to PdfViewer or webview by source type |
| `src/components/PdfViewer.jsx` | Canvas-based PDF renderer (pdfjs-dist), RAF-based continuous scroll |
| `src/components/AddressBar.jsx` | Navigation strip + CMD+L general search (spaces + objects) |
| `src/components/CommandPalette.jsx` | CMD+K command interface |
| `src/components/TagsView.jsx` | Tag management — Types pinned first, schema editor panel, grouped by type |
| `src/components/TypeSchemaSection.jsx` | Guided schema field rows in detail pane |
| `src/components/ImportModal.jsx` | Finder import UI — per-folder tags, already-indexed detection, space creation |
| `src/components/SettingsView.jsx` | Settings — appearance, device, keybinds tab |
| `src/lib/forceSimulation.js` | D3 force simulation — `getNodes` accessor, `updateSimulationNodes`, `updateSimulationDimensions` |

---

## Stack

- **Electron** — Desktop app, native integration
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
├── export/                # Human-readable JSON backup (legacy table names until Phase 3)
│   ├── objects/
│   ├── tag_definitions/
│   ├── tag_types/
│   ├── tagged_edges.json
│   ├── contains_edges.json
│   ├── excludes_edges.json
│   └── typed_edges.json
├── .device-id             # Device UUID + name
├── .version               # Written on first v0.4 boot; gates v0.3 migration
├── appearance.json        # Appearance settings (IPC-backed; localStorage is in-session fallback)
└── window-settings.json   # Window state
```

---

## Built vs Not Yet Built

**Built (through v0.5):** Object CRUD, tagging via edges, spaces (query + explicit contains/excludes + device rules), tag types as first-class records, D3 force graph (●/○ nodes, click-to-select, physics, zoom/drag, live position reconciliation), capture to active space, device identity, v0.3 migration, async export, LIVE SELECT reactivity, command palette, CMD+L general search, objects as navigable locations, `ObjectDetailPane`, CMD+E context-sensitive modal, shared icon module, type icons, per-space filter/sort state, `devices` table + `sourced_from` edges, Settings (Devices tab, Appearance, Keybinds), nav state persistence, Finder import flow, type system with schema, thumbnails, keyboard nav, drag-drop + CMD+V, PDF viewer.

**Built in v0.6:**
- `SYSTEM_EDGES` registry in `edges.js` — single source of truth for edge table creation
- Boot-time backfill (`graph-migration.js`) — walks all legacy `tagged`+`typed` pairs and mirrors each into the corresponding per-edge RELATION table
- Dual-write policy — every legacy mutation also writes the new shape; mirror failures are non-fatal
- Full 19-edge registry + full-object-set backfill (Phase 2 Stage A)
- `rule-compiler.js` — compiles `all`/`any`/`none` + `{ edge, to }` predicates to SurrealQL; validates against `SYSTEM_EDGES`
- `space.rule` evaluation in `space-service.js` (Phase 2 Stage B); `rule` takes precedence over legacy `query`
- `db:getPillsForObject` promoted from `debug.*` to `db.*` — new-shape pill reads now user-facing
- `TagAssignmentSection` renders from `pillsForObject` (new shape) while driving mutations through legacy IPCs
- Live channels on pilot per-edge tables (`type`, `author`, `genre`, `published`) invalidate `pillsForObject`
- `ObjectCardModal`, `QuickSpaceView` renderer components

**Not yet built:**
- Rule editor UI (`SpaceRulesSection` is a stub — Stage B+ deferred)
- Pill-click navigation to edge Objects and value Objects (Stage B+ deferred)
- Phase 3 migration — drop `tag_definitions` / `tag_types` / `devices` / `tagged` / `typed`; rename `contains` → `includes`
- Graph edge rendering (edges exist; `GraphView` renders nodes only)
- In-app relational object view (ego-graph)
- `medium` auto-assignment at capture
- Chrome/Arc/Firefox capture support
- Full-text search
- Multi-device sync

**Dead code (not yet removed):** `CreateSpaceModal` — orphaned; `SpaceRulesSection` inline flow replaces it. Stale `.space-rules` CSS in `ObjectDetailPane.css`. `debug.getPillsForObject` in preload — deprecated alias kept for one release.

---

## Roadmap

### v0.3 (shipped)

File and URL indexing, multi-source objects, auto-assigned system tags, force-directed graph, global Cmd+I capture, device identification, transparent overlay + standard window profiles.

### v0.4 (shipped)

Persistent SurrealDB; LIVE SELECT reactivity; edge-based relationships; space model; tag type system; unified store; command palette; address bar navigation.

### v0.5 (shipped)

Codebase and documentation audit; comment policy; terminology unification; system space ID migration; `ObjectDetailPane` Finder-style sidebar; ●/○ visual language; shared icon module; tag system repair; GraphView click-to-select; `SpaceRulesSection`; `devices` table + `sourced_from` edges; appearance persistence; case-insensitive tag dedup; type system redesign; Finder Sync Extension; thumbnails; keyboard nav; CMD+L general search; objects as navigable locations; CMD+E modal; PDF viewer; type icons.

### v0.6 (current)

`SYSTEM_EDGES` registry; boot-time graph backfill; dual-write policy on all mutation paths; rule compiler; `space.rule` evaluation; `getPillsForObject` promoted; pill rendering cut over to new shape.

### Future

- Stage B+: rule editor UI, pill-click navigation into edge/value Objects
- Phase 3: drop legacy tables, rename `contains` → `includes`
- Graph edge rendering
- Full-screen object view
- Undo system (implemented, archived, unwired)
- Chrome/Arc/Firefox capture
- Full-text search
- Device-to-device file transfer
- Optional sync
