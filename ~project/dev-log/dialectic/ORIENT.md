---
updated: 2026-04-06
session: "020"
author: Claude Sonnet 4.6
---

# ORIENT — Index v0.5

---

## Conceptual Context

Index is a **personal semantic layer** over files and URLs on macOS. The organizing problem:
hierarchical file systems assign one location to each thing. Index lets objects exist in
multiple contexts simultaneously through tags and spaces. Users manage *what things mean*,
not *where they are stored*.

Six explicit design principles (from PROJECT_DESIGN.md):
1. **Objects over locations** — identity is independent of source path
2. **Tags over folders** — multi-dimensional, no duplication
3. **References over copies** — Index points; content stays in place
4. **Queries over navigation** — spaces are saved queries, not static lists
5. **Local-first** — all data on the user's machine; sync is optional and future
6. **Intent-driven interface** — interaction style follows cognitive task

The target user is a "digital collector": accumulates across domains, works across multiple
projects simultaneously, values ownership and control, prefers keyboard-driven interfaces,
needs to see connections between disparate information.

---

## Technical Context

**Three-layer architecture:**
```
Electron Main (SurrealDB, OS access, IPC)
        ↕  IPC + LIVE SELECT push
React Renderer (Zustand, D3)
        ↓
~/.index/surreal/    (primary source of truth)
~/.index/export/     (debounced JSON backup, human-readable)
```

**Data model — single primitive:**
- `objects` table holds everything: files, URLs, and spaces
- A space is an object with `space: true` — no separate table, no separate type
- Space membership formula: `(query_results ∪ contains_edges) − excludes_edges`
- Edges (`tagged`, `contains`, `excludes`, `typed`) are first-class SurrealDB RELATE records

**Reactivity:** LIVE SELECT — DB pushes diffs to renderer on every mutation. Six subscriptions
(objects, tagged, contains, excludes, tag_definitions, typed). No polling. No full reloads.

**System spaces** (seeded on first boot):
- `objects:⟨~⟩` — home/pinned view; holds objects via `contains` edges
- `objects:⟨/⟩` — navigable view of all non-system objects; pinned to home on boot

**Frontend state:** Single Zustand store (`useIndexStore`) — objects, tags, tag types, typed
edges, root objects, active space objects, devices, nav history, active view.

**Built and working (session 016 additions):**
- Drag-and-drop from Finder/desktop onto `ObjectListView` — files and URLs; overlay on dragenter
- CMD+V paste in spaces view — URLs and bare file paths; same `addUrisToSpace()` path as drop
- Dedup by URI against store; `contains` edge added to active space; ROOT space skipped
- Empty state: "Drop files or links to add"; ⌘V entry in Keybinds reference tab

**Built and working:**
- Object CRUD, tag system with typed edges, space creation/evaluation
- Cmd+I capture (Safari + generic handler), deduplication by URI
- LIVE SELECT reactivity on all 6 tables + `sourced_from` edges
- Address bar (CMD+L), command palette (CMD+K), navigation history
- CMD+\` toggles main app window; two window profiles (overlay/window)
- Appearance customization (IPC-backed `~/.index/appearance.json`), device identity, migration chain through v0.4
- Async debounced JSON export
- ObjectDetailPane — name editing, TypeField, TypeSchemaSection (guided schema fields), sources
  (drag-to-reorder, primary = index 0), tag assignment (`TagAssignmentSection` with `TagAddInput`);
  opens on single-click in list or graph view
- SpaceRulesSection — inline tag rule editor (All of / Any of / None of) and device rules
  (From any / Not from) directly in the space detail pane; replaces orphaned `CreateSpaceModal`
- List view: grid column layout, circle type indicators, continuous column dividers, bottom cap,
  alphabetical/date sort; filter by type (two-bit model: `filterSide` + `filterCombined`)
  with backtick and mouse-hold toggle; filter/sort state persisted per space via `localStorage`
- ObjectDetailPane: pin button (◈), source origin badge, "Added" date row; system objects
  hide pin/dates
- GraphView: ●/○ visual language for nodes; click-to-select opens `ObjectDetailPane` sidebar;
  simulation lifecycle split (mount/data/resize); position reconciliation on live data updates
- `src/icons/index.jsx` — canonical icon module: `ObjectIcon`, `SpaceIcon`, `MonadIcon`;
  golden-ratio geometry (inner dot `r=1`, outer ring `r=φ`), `vectorEffect="non-scaling-stroke"`
- `escId()` utility in `surreal-utils.js` for safe raw SurrealQL interpolation
- Hotkeys: `cmd+shift+space` toggle window; `cmd+/` navigate to `/`; `cmd+\`` navigate to `~`;
  `V` toggle list/graph; `` ` `` list filter toggle; Escape from Settings restores prior context
- Keybinds tab in SettingsView (static reference for all hotkeys)
- Settings "Devices" tab — live list of all device records; current device marked with badge
- `devices` table — first-class device records; `sourced_from` RELATE edges connect objects to
  devices; `evaluateSpace()` supports `from_any`/`from_none` device rules; boot-time backfill
  migrates legacy `source.origin` strings to edges
- Nav state (space, view, selected object) persisted to localStorage; restored after loadAll on refresh
- Case-insensitive tag dedup — `string::lowercase()` in SurrealDB; original casing preserved on write
- **Finder import flow** — right-click any folder/file in Finder → "Add to Index" in top-level
  context menu (Finder Sync Extension, `FinderSyncExtension/`); opens `index://import?path=...`;
  Electron reads folder tree recursively (`fs:readFolder`), sends to renderer; `ImportModal`
  presents per-folder tag rows, already-indexed detection, optional space creation (contains or
  rule); `build-host.sh` wraps .appex in `IndexSync.app` for development registration
- **Type system** — `kind` renamed to `type` at all layers; type definitions carry `schema`
  (ordered list of tag type IDs); `TypeSchemaSection` renders guided field rows in detail pane;
  Tags section excludes schema fields; TagsView pins Types tab first with schema editor;
  `seedTypeSchemas` seeds standard schemas on boot (book, document, image, video, audio);
  `TagAssignmentSection` unified to store state (`store.objectTags` + `loadTagsForObject`)

**Not built (active backlog):**
- Object full/dedicated view — double-click opens source URI externally; no in-app object view
- Graph edge rendering (nodes only; `contains`, `tagged`, `sourced_from` data exists and is live)
- Undo system (`useHistoryStore` + `UndoToast` in `_archive/`, not wired)
- Manual pin affordance — pin button in detail pane implemented; no affordance outside detail pane
- Multi-browser capture (Safari + default; Chrome/Arc/Firefox fall through)
- `medium` tag type defined but never auto-assigned at capture time
- **Thumbnails in list view and detail pane** — IPC handler (`fs:thumbnail`), preload, and renderer wiring built in session 017; broken image icons appear at runtime; `nativeImage` data URL output suspected invalid; root cause unconfirmed; requires diagnosis on next attempt

**Dead code (not yet removed):**
- `CreateSpaceModal` — fully orphaned; inline create flow + `SpaceRulesSection` replace it entirely
- Stale `.space-rules` CSS in `ObjectDetailPane.css` — selectors no longer match anything

**Archived (removed from UI, code retained):**
- CalendarView, DayView — `src/components/_archive/`; store calendar state untouched
- Quick Space window — code retained in `electron/main/index.js`; hotkey unbound

---

## Current Synthesis

Sessions 001–002 established the v0.5 baseline: ground-clearing, terminology unification,
comment policy. Sessions 003–004 extended the schema (system space ID migration to
`objects:⟨~⟩` / `objects:⟨/⟩`).

**Session 005** was the first active feature development session:

- Infrastructure repairs: PATH script corrected (was pointing to 0.4), SurrealDB migration
  syntax fixed (SET+UNSET split into two statements), hotkey reorganized (CMD+\` → main window)
- UI additions: creation-date sort in list view, drag-to-reorder sources in detail pane,
  selected-row highlight fix for space rows
- Scope reduction: calendar view removed from the interface and archived
- The list view has an established visual direction (grid layout, circle type indicators,
  column dividers) from user-side redesign — this is the current baseline

**Session 006** was the primary feature-building session for v0.5:

- ObjectDetailPane built — Finder-style sidebar with ●/○ badge, editable name, tag section, space rules section
- ●/○ visual language: solid circle (object), empty circle (space), applied throughout list and detail
- Create affordance: + dropdown in AddressBar → Object/Space; `editNameOnMount` flow for inline naming
- Create placement: new items become children of active space; ALL is excepted (no contains edge needed)
- Root space refactor: `activeSpaceId` is always `HOME_SPACE_ID` at rest — never null
- Semantic rename: `root` → `~` (`HOME_SPACE_ID`), `ALL` → `/` (`ROOT_SPACE_ID`); `escId()` escaping utility
- Hotkeys: `cmd+shift+space` (toggle), `cmd+/` (navigate to `/`), `cmd+\`` (navigate to `~`)
- List view: Finder-style grid columns, continuous dividers, bottom cap, alphabetical sort; pin affordance (◈)

**Sessions 007–010** were the first sustained feature build on top of the 006 baseline:

- **007** — `src/icons/index.jsx` established as shared icon module (golden-ratio geometry, `vectorEffect="non-scaling-stroke"`);
  two-bit filter state (`filterSide` + `filterCombined`); view toggle collapsed to one button; `V` shortcut wired
- **008** — Tag system structural repair: `TagAssignmentSection` rewritten to use `typedEdges` pattern; `TagAddInput`
  flexible single/two-field form with Tab-reveal and cognitive type→value order; `createTag` corrected to pass `typeId`
- **009** — GraphView: click-to-select wired to `ObjectDetailPane`; ●/○ node visual language; simulation lifecycle split
  into mount/data/resize effects; `createForceSimulation` accepts `getNodes` accessor; position reconciliation on live updates
- **010** — Settings Escape restores prior context via `settingsReturnTarget` ref; backtick filter toggle (tap/hold parity);
  Keybinds tab in Settings; filter/sort state persisted per space in `localStorage`; `SpaceRulesSection` inline editor
  replaces `CreateSpaceModal`; `devices` table + `sourced_from` edges across 10 files (schema, service, IPC, store, UI)

- **011** — Settings "General" → "Devices" tab (live device list from store); appearance persistence moved to
  IPC-backed `~/.index/appearance.json` (fixes renderer-kill localStorage loss); case-insensitive tag dedup via
  `string::lowercase()` in SurrealDB with original casing preserved on write; `bgA <= 0` safety guard.

- **012** — Tag creation bug fixed (`string::lowercase(NULL)` guard; dedup type-scoped); `KindField` (later `TypeField`)
  placed in ObjectDetailPane `sharedInfo` block; source add moved to inline SVG circle-plus in SOURCES header;
  nav state persisted to localStorage for refresh survival; Spectral serif trialed and shelved (files retained in `src/fonts/`).

- **013** — Brief orientation session; preload IPC surface explained; no new features.

- **014** — Finder import flow: `FinderSyncExtension/` Swift .appex + `IndexSync.app` host; `index://` URL scheme;
  `fs:readFolder` IPC handler; `ImportModal` with per-folder tags, already-indexed detection, space creation option;
  `build-host.sh` for repeatable dev signing. Key obstacles: sandbox/directoryURLs, `--deep` stripping entitlements,
  ad-hoc signing rejected, `@objc` principal class mismatch.

- **015** — Type system redesign: dialectical synthesis moved `kind` → `type` at all layers. Type definitions
  carry a `schema` (ordered list of tag type IDs). Tag types are the field system — no new data structure.
  `TypeSchemaSection` renders guided fields in detail pane; `TagAssignmentSection` unified to `store.objectTags`;
  Tags section excludes schema fields; TagsView restructured with Types pinned first and schema editor panel;
  `seedTypeSchemas` seeds book/document/image/video/audio schemas on boot.

- **016** — Drag-and-drop and CMD+V paste for adding objects to the active space. `ObjectListView` is a drop
  target for files (Finder) and URLs. Drop and paste share `addUrisToSpace()` in App.jsx; dedup by URI against
  store; adds `contains` edge. Empty state updated to "Drop files or links to add". URL stored raw (no OG fetch
  on drop); full URL used as default object name. OG enrichment deferred to a future session.

---

## Key Decisions

| Decision | Settled |
|---|---|
| "space" is the single term at all layers | Session 002 |
| `contains` and `excludes` edge table names kept — semantically neutral, no migration benefit | Session 002 |
| System space IDs: `objects:⟨~⟩` (home) and `objects:⟨/⟩` (all) | Sessions 003–004 |
| Comment policy: no changelog-style headers; comments describe current state | Session 001 |
| `medium` and `kind` are distinct system types; `medium` auto-assignment is backlog | Session 001 |
| Undo system archived, not deleted — to be re-wired when full object view is built | Session 001 |
| Calendar view archived — not under active development | Session 005 |
| CMD+\` toggles main app window; quick-window is unbound | Session 005 |
| Source order = priority; index 0 is primary source | Session 005 |
| `escId()` is the canonical escaping layer for special-character SurrealDB IDs in raw queries | Session 006 |
| Constants use SDK bracket format (`objects:⟨~⟩`) so in-memory comparisons resolve without escaping | Session 006 |
| System objects (`~`, `/`) always sort first; dates hidden; no pin button in detail pane | Session 006 |
| Icon geometry: `viewBox="0 0 4 4"`, inner dot `r=1`, outer ring `r=φ` (1.618), `vectorEffect="non-scaling-stroke"` | Session 007 |
| Filter state: two-bit model (`filterSide` + `filterCombined`); no ref needed to track pre-combined state | Session 007 |
| Tag type resolved via `typedEdges` edge table, not tag record fields; `createTag` takes `typeId` not type string | Session 008 |
| Graph simulation: three independent effects (mount/data/resize); `getNodes` accessor ensures tick reads live array | Session 009 |
| `onObjectSelect` stored in ref to prevent simulation rebuild on parent re-render | Session 009 |
| Filter/sort prefs: per-space, persisted in `localStorage['index:space-prefs']`, not session-only | Session 010 |
| Space rules editing: inline in `ObjectDetailPane` (`SpaceRulesSection`), not via modal | Session 010 |
| Devices are first-class records (`devices` table), not embedded strings; `sourced_from` edges are the relation | Session 010 |
| Finder Sync Extension requires sandbox + real developer cert; `directoryURLs = "/"` works sandboxed for menu display | Session 014 |
| Host app (`IndexSync.app`) wraps .appex for dev; sign without `--deep` to preserve embedded extension entitlements | Session 014 |
| Import modal is the canonical entry point for bulk folder ingestion; drag-drop and single-file add are parallel future modalities | Session 014 |
| `kind` renamed to `type` at all layers; object type is `object ==type=> 'book'` edge tuple | Session 015 |
| Schema lives in interface layer, not data model — tag definition record carries `schema: [tag_type_ids]` | Session 015 |
| Tag types are the field system; schema fields are tag types; no new data structure | Session 015 |
| `TagAssignmentSection` reads from `store.objectTags[objectId]` + `loadTagsForObject`; no local state | Session 015 |
| Appearance persisted to `~/.index/appearance.json` via IPC-to-main; localStorage is in-session cache only | Session 011 |
| Case-insensitive tag dedup: `string::lowercase()` in SurrealDB on create/lookup; original casing stored | Session 011 |
| Drop/paste share `addUrisToSpace()`; dedup client-side by URI string match against store | Session 016 |
| OG metadata fetch deferred — URL stored raw on drop/paste; enrichment is a future feature | Session 016 |
| Full URL used as default object name for dropped/pasted URLs | Session 016 |

---

## Open Contradictions

- **Graph renders nodes only.** `contains`, `tagged`, and `sourced_from` edges are live
  and complete in the data model. `GraphView` renders labeled circles with no edges. The
  visualization does not reflect the relational model.

- **No full-screen object view.** Single-click opens the detail sidebar. Double-click on
  a leaf opens its source URI externally. There is no dedicated in-app view for a single
  object at full focus.

- **`medium` auto-assignment is dormant.** The tag type is registered, seeded, and
  documented. No capture handler derives or assigns it. `type` tags are applied at capture;
  `medium` tags never appear unless manually created.

- **Undo is in archive.** `useHistoryStore` and `UndoToast` were built, are complete, and
  are not wired. Destructive actions (delete, unpin) are irreversible in the current UI.

- **Capture is Safari-only in practice.** The `defaultHandler` fires for non-Safari apps
  but produces no output. Chrome, Arc, Firefox users get a focused Index window with nothing
  captured. (Finder import is now handled via the import flow, not capture.)

- **`CreateSpaceModal` is fully orphaned.** The inline create flow (session 006) and
  `SpaceRulesSection` (session 010) together replace everything it did. The component
  remains mounted and unreachable.

- **Stale `.space-rules` CSS in `ObjectDetailPane.css`.** Those selectors no longer match
  anything now that `SpaceRulesSection` owns the rules display.

- **Type schema is append-only in the editor.** The TagsView schema editor (Add field input)
  can add tag types to a type's schema but cannot reorder or remove existing fields.

- **Type is singular by convention, not enforced.** An object with multiple `type` edges
  is a data inconsistency — `TypeSchemaSection` will show the first type found. No UI
  prevents multiple type assignments.

- **Capture profiles per type not built.** Type governs what the UI suggests, but the
  capture handler does not read type definitions or vary what metadata it targets.
