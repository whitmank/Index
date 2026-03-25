---
author: Claude Code
date: 2026-03-17
---

# Index — Backlog

Items not yet implemented, organized by theme. Status reflects codebase as of 2026-03-17.

---

## Graph & Visualization

- **Relationship edge rendering** — GraphView renders nodes only. The edge tables (`contains`, `tagged`, `excludes`) exist and are live; no visual representation of these relationships exists in the graph.
- **Node grouping** — No visual clustering by tag or space membership.
- **Zoom to selected** — GraphView supports zoom/pan but no auto-center on node selection.
- **Performance** — No virtual rendering for large graphs. Force simulation will degrade with 1,000+ nodes.

---

## Object Detail

- **Object detail view** — `onObjectOpen` is called in ObjectListView on double-click of a leaf object; App.jsx receives it but does nothing. No detail panel, slide-in sheet, or modal exists.
- **Notes editing** — `user_metadata` exists in object schema but no UI to edit notes.
- **Source file metadata** — File size and last-modified not displayed for local sources.
- **URL metadata** — No title, description, or favicon fetching for web sources beyond what is captured at index time.

---

## Spaces

- **Manual pin affordance** — `db:addContains` and `db:removeContains` are implemented. No UI affordance for manually pinning an existing object into a space (drag target, context menu, etc.).
- **`display: false` tags in space builder** — `file` and `origin` tag types have `display: false`. CreateSpaceModal's tag pool does not filter on this flag — these tags appear as selectable query terms.

---

## Tags

- **Tag autocomplete** — No fuzzy search or autocomplete when assigning tags.
- **Tag color in graph** — Graph nodes render as uniform circles. No color differentiation by tag.
- **Global tag rename** — Only individual tag editing via `db:updateTag`. No bulk rename across all assignments.
- **Tag merge** — No logic to combine two tags and re-assign all objects.

---

## Sources & Capture

- **Chrome/Arc/Firefox capture** — Cmd+I capture is Safari-only. `capture/index.js` has a `safariHandler` and a generic `defaultHandler`; no browser-specific handlers for others.
- **Source type indicators** — No visual distinction between file and URL objects.
- **Additional URI schemes** — No support for `notion://`, `obsidian://`, `smb://`. Only `http/https` and `file://` handled.
- **Deduplication warning** — Cmd+I silently focuses existing object when a URI already exists. No user-facing warning or merge offer.

---

## Undo

- **Undo system** — `useHistoryStore` and `UndoToast` are implemented but archived (`src/_archive/`). Not wired into the current UI.

---

## Settings & Customization

- **Appearance: accent color and font size** — HSLA background controls are implemented. Accent color picker and font size controls are not.
- **Keyboard shortcut customization** — Shortcuts are hardcoded in `useKeyboardShortcuts.js`. No Settings UI to rebind.
- **Data directory** — `~/.index/` is hardcoded. No UI to change location.
- **Export on demand** — Export runs automatically (debounced 5s, and on quit). No user-facing trigger in Settings.

---

## Data Integrity

- **Deduplication management** — No UI to surface or merge duplicate objects.
- **Source repair UI** — `db:repairMissingSystemTags` exists and is fully implemented; not wired to any UI.
- **Import / restore** — No UI to re-import from JSON export files.
- **`findObjectByUri` scalability** — Currently a full table scan (`SELECT * FROM objects`) with JS-level filtering. Will not scale.

---

## Quality & Infrastructure

- **Error boundaries** — No React error boundaries around views.
- **Testing suite** — No unit or integration tests.
- **Virtual scrolling** — Object lists have no virtualization.
- **Windows/Linux parity** — Vibrancy and capture system are macOS-only.

---

## Implemented (for reference)

Features complete and working as of 2026-03-17:

- Persistent SurrealDB at `~/.index/surreal/`
- LIVE SELECT reactivity on all six tables — DB pushes diffs to renderer, no full reloads
- Edge-based relationships — `tagged`, `contains`, `excludes`, `typed`
- Space model — spaces are objects with `space: true`; no separate table
- `evaluateSpace` — server-side membership formula: `(query_results ∪ contains_edges) − excludes_edges`
- `objects:root` and `objects:all` — deterministic system spaces seeded on first boot
- Tag types as first-class `tag_types` records; type membership via `typed` edges
- System tag type registry in `domain/tag-types.js`; seeded via UPSERT on every boot
- Async debounced JSON export — `scheduleExport()` everywhere mutations happen
- ID normalization — fully-qualified SurrealDB IDs and edge `in`/`out` fields stringified throughout
- v0.3 → v0.4 migration — one-time import from `~/.index/objects/` JSON on first boot
- Command palette (CMD+K) — space and settings navigation
- Address bar (CMD+L) — integrated space navigator with keyboard navigation
- Quick Space overlay — floating always-on-top window
- Window behavior profiles — Overlay and Window modes
- Appearance settings — light/dark theme + HSLA background controls
- Cmd+I capture — Safari + generic default handler, deduplication by URI, imports to active space
