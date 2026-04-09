---
author: Claude Sonnet 4.6
date: 2026-03-26
---

# Index — Backlog

Items not yet implemented, organized by theme. Status reflects codebase as of 2026-04-03.

---

## Graph & Visualization

- **Relationship edge rendering** — GraphView renders nodes only. The edge tables (`contains`, `tagged`, `sourced_from`) exist and are live; no visual representation of relationships in the graph.
- **Node grouping** — No visual clustering by tag or space membership.
- **Zoom to selected** — GraphView supports zoom/pan but no auto-center on node selection.
- **Performance** — No virtual rendering for large graphs. Force simulation will degrade with 1,000+ nodes.

---

## Object Detail

- **No full-screen object view** — `ObjectDetailPane` (sidebar) opens on single-click selection. Double-click on a leaf opens its source URI externally. No dedicated in-app full-focus view for a single object.
- **Notes editing** — `user_metadata` exists in object schema but no UI to edit notes.
- **Source file metadata** — File size and last-modified not displayed for local sources.
- **URL metadata** — No title, description, or favicon fetching for web sources beyond what is captured at index time.

---

## Spaces

- **Manual pin affordance outside detail pane** — The pin button (◈) in `ObjectDetailPane` pins/unpins from `~`. No affordance for pinning into an arbitrary space (drag target, context menu, etc.).
- **`display: false` tags in space rule autocomplete** — `file` and `origin` tag types have `display: false`. `SpaceRulesSection`'s tag autocomplete may surface these tags as selectable query terms.

---

## Tags

- **Tag color in graph** — Graph nodes render as uniform circles. No color differentiation by tag.
- **Global tag rename** — Only individual tag editing via `db:updateTag`. No bulk rename across all assignments.
- **Tag merge** — No logic to combine two tags and re-assign all objects.
- **`medium` auto-assignment** — The `medium` tag type is registered and seeded. Nothing at capture time derives or assigns it. Relevant for audio, video, image discrimination.

## Type System

- **Type schema reorder/remove** — The schema editor in TagsView (Add field input) can add new field types to a type's schema but cannot reorder them or remove existing fields.
- **Capture profiles per type** — Type should govern what metadata the capture handler targets (e.g. a "book" type could trigger ISBN lookup). The data model is ready; no capture handler reads type definitions.
- **Type enforcement** — Type is singular by convention (UI should prevent multiple type edges on one object) but not enforced at the data level. UI conflict on multiple `type` edges is not yet handled.

---

## Sources & Capture

- **Chrome/Arc/Firefox capture** — Cmd+I capture is Safari-only. `capture/index.js` has a `safariHandler` and a generic `defaultHandler`; no browser-specific handlers for others.
- **Source type indicators** — No visual distinction between file and URL objects in the list.
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
- **Export on demand** — Export runs automatically (debounced 5s, and on quit). No user-facing trigger in Settings.

---

## Data Integrity

- **Deduplication management** — No UI to surface or merge duplicate objects.
- **Source repair UI** — `db:repairMissingSystemTags` exists and is fully implemented; not wired to any UI.
- **Import / restore** — No UI to re-import from JSON export files.
- **`findObjectByUri` scalability** — Currently a full table scan (`SELECT * FROM objects`) with JS-level filtering. Will not scale.

---

## Dead Code (not yet removed)

- **`CreateSpaceModal`** — Fully orphaned. The inline create flow (session 006) and `SpaceRulesSection` (session 010) together replace everything it did. Component is mounted but never opened.
- **Stale `.space-rules` CSS in `ObjectDetailPane.css`** — Selectors no longer match anything since `SpaceRulesSection` took over the rules display.

---

## Quality & Infrastructure

- **Error boundaries** — No React error boundaries around views.
- **Testing suite** — No unit or integration tests.
- **Virtual scrolling** — Object lists have no virtualization.
- **Windows/Linux parity** — Vibrancy and capture system are macOS-only.

---

## Implemented (for reference)

Features complete and working as of 2026-04-03:

- Persistent SurrealDB at `~/.index/surreal/`
- LIVE SELECT reactivity on objects, `tagged`, `contains`, `excludes`, `typed`, `sourced_from` — DB pushes diffs to renderer, no full reloads
- Edge-based relationships — `tagged`, `contains`, `excludes`, `typed`, `sourced_from`
- Space model — spaces are objects with `space: true`; no separate table
- `evaluateSpace` — server-side membership formula: `(query_results ∪ contains_edges) − excludes_edges`, extended for `from_any`/`from_none` device rules
- `objects:⟨~⟩` (home) and `objects:⟨/⟩` (all) — deterministic system spaces seeded on first boot
- `escId()` — canonical escaping layer for special-character SurrealDB IDs in raw queries
- Tag types as first-class `tag_types` records; type membership via `typed` edges
- System tag type registry in `domain/tag-types.js`; seeded via UPSERT on every boot
- Async debounced JSON export — `scheduleExport()` everywhere mutations happen
- ID normalization — fully-qualified SurrealDB IDs and edge `in`/`out` fields stringified throughout
- v0.3 → v0.4 migration — one-time import from `~/.index/objects/` JSON on first boot
- Command palette (CMD+K) — space and settings navigation
- Address bar (CMD+L) — integrated space navigator with keyboard navigation
- Window behavior profiles — Overlay and Window modes
- Appearance settings — light/dark theme + HSLA background controls
- Cmd+I capture — Safari + generic default handler, deduplication by URI, imports to active space
- `ObjectDetailPane` — Finder-style sidebar: name editing, source badge, tag assignment (`TagAssignmentSection` with `TagAddInput` autocomplete), space rules (`SpaceRulesSection`), pin button (◈); opens on single-click in list or graph view
- `src/icons/index.jsx` — shared icon module: `ObjectIcon` (●), `SpaceIcon` (○), `MonadIcon` (◎); golden-ratio geometry (`r=1`, `r=φ`), `vectorEffect="non-scaling-stroke"`
- List view — grid column layout, ●/○ type indicators, two-bit filter (`filterSide` + `filterCombined`) with backtick and mouse-hold toggle, sort by name/date; filter/sort state persisted per space via `localStorage['index:space-prefs']`
- GraphView — ●/○ nodes, click-to-select opens `ObjectDetailPane`, zoom/pan, split simulation lifecycle (mount/data/resize effects), live position reconciliation on data updates
- Create affordance — `+` dropdown in AddressBar; new items created as children of active space with name field active
- `devices` table — first-class device records; `sourced_from` edges connect objects to devices; boot-time backfill migrates legacy `source.origin` strings
- Settings — "Devices" tab (live device list, current device marked), Keybinds tab (static reference for all hotkeys), Escape restores prior view/space context
- Hotkeys: `Cmd+Shift+Space` toggle window; `Cmd+\`` navigate to `~`; `Cmd+/` navigate to `/`; `V` toggle list/graph; `` ` `` list filter toggle
- Appearance settings persisted to `~/.index/appearance.json` (IPC-backed; survives renderer kill)
- Case-insensitive tag dedup (`string::lowercase()` in SurrealDB; original casing preserved on write)
- Nav state (space, view, selected object) persisted to localStorage; restored after loadAll on refresh
- Finder import flow — Finder Sync Extension adds "Add to Index" to context menu; `ImportModal` for batch tag application; `fs:readFolder` IPC handler; `IndexSync.app` host for dev registration
- Type system — `kind` renamed to `type`; type definitions carry `schema` (ordered tag type IDs); `TypeSchemaSection` renders guided field rows; `TagAssignmentSection` unified to store state; TagsView Types tab; `seedTypeSchemas` seeds standard schemas on boot
