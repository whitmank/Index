---
author: Claude Opus 4.7
date: 2026-04-19
version: 0.6
based_on: 0.5/docs/BACKLOG.md (Claude Sonnet 4.6, 2026-04-17)
---

# Index — Backlog

Items not yet implemented, organized by theme. Status reflects codebase as of 2026-04-19.

---

## Migration (Phase 3)

The current codebase is at Phase 2 Stage B: dual-write is active, the new shape is user-facing for reads, and the rule compiler is live. Phase 3 remains deferred.

- **Drop legacy tables** — `tag_definitions`, `tag_types`, `devices`, `tagged`, `typed` are still authoritative. Phase 3 removes them after a version ships reading entirely from the new shape.
- **Rename `contains` → `includes`** — The new shape uses `includes`; `contains` is the live legacy name. Requires rewriting the edge table, repointing all consumers (store, IPC, live-queries, space-service), and updating the export.
- **Stop dual-writing** — Once legacy tables are dropped, the mirroring logic in `db-handlers.js`, `object-service.js`, and `graph-migration.js` can be removed.
- **Update JSON export** — Export paths and table names still reference legacy schema. After Phase 3, update export to reflect the unified graph.
- **`SYSTEM_EDGES` / `TYPE_SCHEMAS` sync** — Adding a new edge requires updating both `edges.js` and `graph-migration.js`. Phase 3 consolidates this.

---

## Stage B+ (Deferred from 0.6)

- **Rule editor UI** — `SpaceRulesSection` is a stub. No UI exists to create or edit a space `rule`. Users can set rules programmatically but not through the app.
- **Pill-click navigation** — Every pill is two Objects separated by a colon; both should be clickable for navigation. Clicking a value Object (e.g. "Andy Weir") navigates to `objects:⟨andy_weir⟩`; clicking an edge label (e.g. "AUTHOR") navigates to `objects:⟨author⟩`. Not yet wired.
- **"OTHER" pill group** — Objects with edges absent from their type's schema are invisible in the pill list. Stage B+ will expose them under a secondary group.

---

## Graph & Visualization

- **Relationship edge rendering** — `GraphView` renders nodes only. Edge tables exist and have LIVE SELECT coverage; no visual representation of relationships.
- **Node grouping** — No visual clustering by type, space membership, or edge.
- **Zoom to selected** — GraphView supports zoom/pan but no auto-center on node selection.
- **Performance** — No virtual rendering for large graphs. Force simulation will degrade with 1,000+ nodes.
- **In-app relational object view** — Entering a leaf object as a location shows an empty graph. Intended experience (ego-graph: object at center, edges to relations) requires graph edge rendering.

---

## Object Detail

- **Notes editing** — `user_metadata` exists in object schema but no UI to edit notes.
- **Source file metadata** — File size and last-modified not displayed for local sources.
- **URL metadata** — No title, description, or favicon fetching for web sources beyond what is captured at index time.
- **Epub cover thumbnails** — `fs:epubCover` via `qlmanage` requires Books.app QuickLook plugin; untested on machines without Books.app.

---

## Spaces

- **Manual pin affordance outside detail pane** — The pin button (◈) in `ObjectDetailPane` pins/unpins from `~`. No affordance for pinning into an arbitrary space (drag target, context menu, etc.).
- **`display: false` tags in space rule autocomplete** — `file` and `origin` tag types have `display: false`. Rule autocomplete (once built) must filter these from selectable predicates.

---

## Tags & Edges

- **`medium` auto-assignment** — The `medium` edge is registered and seeded. Nothing at capture time derives or assigns it. Relevant for audio, video, image discrimination.
- **Global rename** — Only individual tag/value editing. No bulk rename across all assignments.
- **Tag merge** — No logic to combine two value Objects and re-assign all objects.
- **Tag color in graph** — Graph nodes render as uniform circles. No color differentiation by tag or edge type.

---

## Type System

- **Type schema reorder/remove** — The schema editor in TagsView can add new field edges but cannot reorder them or remove existing fields.
- **Capture profiles per type** — Type should govern what metadata the capture handler targets (e.g. a "book" type could trigger ISBN lookup). The data model is ready; no capture handler reads type definitions.
- **Type enforcement** — Type is singular by convention but not enforced at the data level. No UI conflict handling for multiple `type` edges on one object.

---

## Sources & Capture

- **Chrome/Arc/Firefox capture** — Cmd+I capture is Safari-only. `capture/index.js` has a `safariHandler` and a generic `defaultHandler`; no browser-specific handlers for others.
- **Additional URI schemes** — No support for `notion://`, `obsidian://`, `smb://`. Only `http/https` and `file://` handled.
- **Deduplication warning** — Cmd+I silently focuses existing object when a URI already exists. No user-facing warning or merge offer.

---

## Undo

- **Undo system** — `useHistoryStore` and `UndoToast` are implemented but archived (`src/_archive/`). Not wired into the current UI. Destructive actions (delete, unpin) are irreversible.

---

## Settings & Customization

- **Appearance: accent color and font size** — HSLA background controls are implemented. Accent color picker and font size controls are not.
- **Keyboard shortcut customization** — Shortcuts are hardcoded in `useKeyboardShortcuts.js`. The Keybinds tab in Settings is static documentation, not a rebind UI.
- **Data directory** — `~/.index/` is hardcoded. No UI to change location.
- **Export on demand** — Export runs automatically. No user-facing trigger in Settings.

---

## Data Integrity

- **Deduplication management** — No UI to surface or merge duplicate objects.
- **Source repair UI** — `db:repairMissingSystemTags` exists and is fully implemented; not wired to any UI.
- **Import / restore** — No UI to re-import from JSON export files.
- **`findObjectByUri` scalability** — Currently a full table scan with JS-level filtering. Will not scale.

---

## Dead Code (not yet removed)

- **`CreateSpaceModal`** — Fully orphaned. The inline create flow and `SpaceRulesSection` replace everything it did.
- **Stale `.space-rules` CSS in `ObjectDetailPane.css`** — Selectors no longer match anything since `SpaceRulesSection` took over.
- **`debug.getPillsForObject` in preload** — Deprecated alias kept for one release; remove after confirming no active callers.

---

## Quality & Infrastructure

- **Error boundaries** — No React error boundaries around views.
- **Testing suite** — No unit or integration tests.
- **Virtual scrolling** — Object lists have no virtualization.
- **Windows/Linux parity** — Vibrancy and capture are macOS-only.

---

## Implemented (for reference)

Features complete and working as of 2026-04-19:

- Persistent SurrealDB at `~/.index/surreal/`
- LIVE SELECT reactivity on objects, all five legacy edge tables, `devices`, and pilot per-edge tables (`type`, `author`, `genre`, `published`)
- `SYSTEM_EDGES` registry in `edges.js` — single source of truth for edge table creation and migration
- Boot-time backfill (`graph-migration.js`) — idempotent; mirrors all legacy `tagged`+`typed` pairs into per-edge RELATION tables
- Dual-write policy on all mutation hot paths — `db:assignTag`, `db:unassignTag`, `db:deleteTag`, `assignSystemTagsFromSources`; mirror failures non-fatal
- Full 19-edge registry; edge Objects and type Objects seeded at boot
- `rule-compiler.js` — compiles `all`/`any`/`none` + `{ edge, to }` predicates to SurrealQL; validates edge names against `SYSTEM_EDGES`
- `space.rule` evaluation in `space-service.js`; `rule` takes precedence over legacy `query`
- `db:getPillsForObject` promoted to `db.*` — new-shape pill reads user-facing
- `TagAssignmentSection` renders from `pillsForObject` (new shape) while driving mutations through legacy IPCs
- All v0.5 features: space model, tag types, D3 force graph, capture, device identity, ObjectDetailPane, CMD+E modal, shared icon module, type icons, per-space filter/sort, Finder import, thumbnails, keyboard nav, CMD+L general search, objects as navigable locations, PDF viewer, appearance persistence, case-insensitive tag dedup, nav state persistence
