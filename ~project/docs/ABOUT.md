---
title: About Index
version: 0.5
date: 2026-03-26
author: Claude Sonnet 4.6
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
- **Tag Type** — a first-class `tag_types` record. Membership expressed as a `typed` edge from `tag_definitions` to `tag_types`. System types: `medium`, `type`, `file`, `origin`.
- **Object Type** — the structural category of an object (book, song, image, etc.), expressed as a `type`-typed tag edge. Type definitions carry a `schema` — an ordered list of tag type IDs — that the UI reads to render guided metadata fields in the detail pane.

---

## Edges

Relationships between records are expressed as SurrealDB `RELATE` edges — typed as `TYPE RELATION`, with their own `id`, `in`, `out` fields, and optional data. Five edge tables are in use:

| Table | Direction | Data |
|---|---|---|
| `tagged` | `objects → tag_definitions` | — |
| `contains` | `objects → objects` | `order` |
| `excludes` | `objects → objects` | — |
| `typed` | `tag_definitions → tag_types` | — |
| `sourced_from` | `objects → devices` | — |

Edges replace all previous join tables. LIVE SELECT subscriptions run on all five edge tables, keeping the renderer reactive to relationship changes without record rescans.

---

## Key Flows

**Adding an object:** Drop a file or paste a URL → main process creates object in SurrealDB, assigns system tags via `RELATE` edges, schedules export → LIVE SELECT fires → renderer state updates.

**Entering a space:** `db:evaluateSpace(id)` runs the membership formula server-side: `(query_results ∪ contains_edges) − excludes_edges`. Result stored in `activeSpaceObjects`. Re-evaluated on any relevant LIVE SELECT event.

**Capture:** CMD+I global hotkey extracts frontmost browser tab URL/title → creates or updates object → imports into the active space via a `contains` edge.

---

## Frontend State

Single Zustand store (`useIndexStore`) owns: `objects` (all records — both spaces and leaves), `tags`, `tagTypes` (sorted `tag_types` records), `typedEdges`, `devices` (all device records), `rootObjects` (evaluated membership of `objects:⟨~⟩`), `activeSpaceObjects` (evaluated membership of the active space), `objectTags` cache, and navigation history.

---

## Key Files

| File | Purpose |
|------|---------|
| `electron/main/index.js` | App lifecycle, hotkeys, startup sequence |
| `electron/main/db/connection.js` | SurrealDB process management, table init, system space seeding, boot-time device backfill |
| `electron/main/db/live-queries.js` | LIVE SELECT subscriptions → renderer push (objects + 5 edge tables) |
| `electron/main/db/export.js` | Async JSON export with debouncing |
| `electron/main/db/migration.js` | v0.3→v0.4 one-time import |
| `electron/main/db/services/object-service.js` | Object creation + system tag assignment + `sourced_from` edge wiring |
| `electron/main/db/services/space-service.js` | Space membership evaluation; device rule support (`from_any`/`from_none`) |
| `electron/main/db/services/device-service.js` | `getOrCreateDevice`, `getDevices`, `setSourcedFromEdges` |
| `electron/main/ipc/db-handlers.js` | Full database API (objects, tags, tag types, spaces, edges, devices) |
| `electron/main/domain/tag-types.js` | System tag type registry (`SYSTEM_TAG_TYPES`); `seedTagTypes()` |
| `electron/preload/index.js` | Context bridge (secure IPC surface) |
| `src/icons/index.jsx` | Shared icon module — `ObjectIcon`, `SpaceIcon`, `MonadIcon`; golden-ratio geometry |
| `src/store/index.js` | `useIndexStore` — unified state + LIVE SELECT wiring |
| `src/App.jsx` | Root component, mount sequencing, view routing, filter/sort pref persistence |
| `src/components/ObjectListView.jsx` | List view — two-bit filter state, sort, backtick toggle, per-space pref callbacks |
| `src/components/ObjectDetailPane.jsx` | Detail sidebar — name editing, TypeField, TypeSchemaSection, tag assignment, space rules, pin button, source badge |
| `src/components/TagAssignmentSection.jsx` | Tag assignment UI — `typedEdges` pattern, `TagAddInput` flexible form |
| `src/components/SpaceRulesSection.jsx` | Inline space rule editor — tag and device rule groups |
| `src/components/AddressBar.jsx` | Navigation strip + integrated CMD+L space navigator |
| `src/components/CommandPalette.jsx` | CMD+K command interface |
| `src/components/TagsView.jsx` | Tag management — Types pinned first, schema editor panel, grouped by type |
| `src/components/TypeSchemaSection.jsx` | Guided schema field rows in detail pane, driven by type definition `schema` field |
| `src/components/ImportModal.jsx` | Finder import UI — per-folder tags, already-indexed detection, space creation |
| `src/components/GraphView.jsx` | D3 force-directed graph — ●/○ nodes, click-to-select, split simulation lifecycle |
| `src/components/SettingsView.jsx` | Settings — appearance, device, keybinds tab |
| `src/lib/forceSimulation.js` | D3 force simulation — `getNodes` accessor, `updateSimulationNodes`, `updateSimulationDimensions` |

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
├── appearance.json        # Appearance settings (IPC-backed; localStorage is in-session fallback)
└── window-settings.json   # Window state
```

---

## Built vs Not Yet Built

**Built:** Object CRUD, tagging via edges, spaces (query + explicit contains/excludes + device rules), tag types as first-class records, D3 force graph (●/○ nodes, click-to-select, physics, zoom/drag, live position reconciliation), capture to active space, device identity, v0.3 migration, async export, LIVE SELECT reactivity on all five edge tables + objects + tag definitions, command palette, address bar navigation, `ObjectDetailPane` (name editing, TypeField, TypeSchemaSection, tag assignment with autocomplete, space rules inline editor, pin button, source badge), shared icon module (`src/icons/index.jsx`), per-space filter/sort state persisted in `localStorage`, `devices` table + `sourced_from` edges, Settings "Devices" tab (live device list), keybinds tab in Settings, nav state persistence across refresh, case-insensitive tag dedup (casing preserved), appearance settings persisted to `~/.index/appearance.json`, Finder import flow (`FinderSyncExtension/`, `ImportModal`, `fs:readFolder` IPC), type system with schema (`kind` → `type`, `seedTypeSchemas`, `TypeSchemaSection`).

**Not yet built:** Undo system (archived), graph edge rendering (`contains`/`tagged`/`sourced_from` data exists; GraphView renders nodes only), full-screen object view (detail sidebar exists; no full-focus view), `medium` auto-assignment (type seeded; nothing assigns it at capture), capture per-type profiles, full-text search, multi-device sync.

**Dead code (not yet removed):** `CreateSpaceModal` — orphaned; `SpaceRulesSection` + inline create flow replace it. Stale `.space-rules` CSS in `ObjectDetailPane.css`.

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

- Codebase and documentation audit; comment policy established (sessions 001–002)
- Terminology unification (`container` → `space`) across all layers (session 002)
- System space ID migration to `objects:⟨~⟩` / `objects:⟨/⟩`; `escId()` escaping utility (sessions 003–006)
- ObjectDetailPane — Finder-style sidebar with ●/○ badge, name editing, tag assignment, rules, pin button (session 006)
- ●/○ visual language; create affordance with inline naming; root space refactor (session 006)
- Shared icon module (`src/icons/index.jsx`) with golden-ratio geometry (session 007)
- Two-bit filter state model; view toggle; `V` shortcut (session 007)
- Tag system repair — `typedEdges` pattern, `TagAddInput` flexible form, `createTag` fix (session 008)
- GraphView click-to-select; simulation lifecycle split (mount/data/resize); live position reconciliation (session 009)
- Settings Escape restores prior context; per-space filter/sort persisted in `localStorage` (session 010)
- `SpaceRulesSection` inline editor replaces orphaned `CreateSpaceModal` (session 010)
- `devices` table + `sourced_from` edges; `evaluateSpace` device rules; boot-time backfill (session 010)
- Settings "General" → "Devices" tab; live device list from store (session 011)
- Appearance persistence moved to IPC-backed `~/.index/appearance.json`; `bgA <= 0` safety guard (session 011)
- Case-insensitive tag dedup via `string::lowercase()` in SurrealDB; original casing preserved (session 011)
- Tag creation bug fixed (`string::lowercase(NULL)` guard); dedup type-scoped (session 012)
- `KindField` in detail pane (later `TypeField`); KIND suppressed from Tags section (session 012)
- Source add as inline SVG circle-plus in SOURCES header (session 012)
- Nav state (space, view, detail object) persisted to localStorage; restored after `loadAll` (session 012)
- Finder Sync Extension (`FinderSyncExtension/`) + `IndexSync.app` host; `index://` URL scheme; `fs:readFolder` IPC handler; `ImportModal` (session 014)
- Type system redesign: `kind` → `type` at all layers; `schema` field on type tag_definitions; `TypeSchemaSection`; `TagAssignmentSection` store unification; TagsView Types tab; `seedTypeSchemas` on boot (session 015)

### Future

- Graph edge rendering (`contains`, `tagged`, `sourced_from` visualization)
- Full-screen object view (detail sidebar exists; no dedicated full-focus view)
- Undo system (archived, complete, unwired)
- Chrome/Arc/Firefox capture support
- Full-text search
- Device-to-device file transfer (foundation in place: `devices` table, `sourced_from` edges)
- Optional sync (local-first, sync-optional model)
