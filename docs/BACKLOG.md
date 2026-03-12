---
Author: Claude Code
Updated: 2026-03-11
---

# Index — Backlog

Items not yet implemented, organized by theme. Status reflects codebase as of 2026-03-11.

---

## Collections

- **Collection filtering is a no-op** — `_evaluateCollectionLocally()` in `useIndexStore` ignores its `query` argument and returns all objects. `activateCollection` sets `activeCollectionId` but never calls `db:evaluateCollection`. The server-side evaluator is fully implemented in `ipc/db-handlers.js`; it has no caller. Fix: call `db:evaluateCollection` from `activateCollection` and store the result, or implement client-side evaluation against the `objectTags` cache.
- **Collection builder UI** — TagSelector dropdown exists and shows tag names, but no visual query builder; users must know tag IDs to construct rules manually.
- **Ad-hoc filtering** — No way to filter the graph without saving as a named collection.

---

## Relationships

- **Data model** — No relationship table or schema exists yet. Must be designed before any UI work.
- **Relationship UI** — Create, view, and delete links between objects from the detail sidebar.
- **Relationship display in graph** — Render typed links as edges in the force-directed graph. GraphView currently renders nodes only.
- **Relationship types** — Typed links ("references", "derived from", "related to") with optional label.
- **Bidirectional traversal** — Navigate from an object to everything it links to and from.

---

## Tags

- **Tag autocomplete** — No fuzzy search or autocomplete when assigning tags. TagAssignmentSection allows creation but not search.
- **Tag color in graph** — Graph nodes render as uniform circles. No color differentiation by tag.
- **Expose file_type and origin as tag UI** — `media_type` is displayed (`display: true` in `tag-types.js`). `file_type` and `origin` are `display: false` — their values appear in source metadata but not as editable tag UI. Decide whether to expose them.
- **Global tag rename** — Only individual tag editing via `db:updateTag`. No bulk rename across all assignments.
- **Tag merge** — No logic to combine two tags and re-assign all objects.

---

## Sources & Capture

- **Chrome/Arc/Firefox capture** — Cmd+I capture is Safari-only. `capture/index.js` has `safariHandler` and a generic `defaultHandler`; no browser-specific handlers for others.
- **Source type indicators** — No visual distinction in graph between file and URL objects.
- **Additional URI schemes** — No support for `notion://`, `obsidian://`, `smb://`. Only `http/https` and `file://` handled.
- **Source copying** — No download/cache functionality for remote sources.
- **Deduplication warning** — Cmd+I silently focuses existing object when a URI already exists. No user-facing warning or merge offer.

---

## Graph & Visualization

- **Relationship edges** — No edges rendered. Blocked by relationship data model.
- **Node grouping** — No visual clustering by tag or collection.
- **Zoom to selected** — GraphView supports zoom/pan but no auto-center on node selection.
- **Performance** — No virtual rendering for large graphs. Force simulation will degrade with 1,000+ nodes.

---

## Object Detail

- **Notes editing** — `user_metadata` exists in object schema but no UI to edit `user_metadata.notes`.
- **Relationship panel** — No links section in ObjectDetailSidebar. Blocked by relationship data model.
- **Source file metadata** — File size and last-modified not displayed for local sources.
- **URL metadata** — No title, description, or favicon fetching for web sources.

---

## Settings & Customization

- **Appearance: accent color and font size** — HSLA background controls are implemented (`AppearanceSettings.jsx`). Accent color picker and font size controls are not.
- **Keyboard shortcut customization** — Shortcuts are hardcoded in `useKeyboardShortcuts.js`. No Settings UI to rebind.
- **Data directory** — `~/.index/` is hardcoded across multiple files. No UI to change location.
- **Export on demand** — Export runs automatically (debounced 5s, and on quit) to `~/.index/export/`. No user-facing trigger button in Settings.

---

## Data Integrity

- **Deduplication management** — No UI to surface or merge duplicate objects.
- **Source repair UI** — `db:repairMissingSystemTags` exists in handlers but is not wired to any UI.
- **Import / restore** — No UI to re-import from JSON export files or zip backup.

---

## Quality & Infrastructure

- **Error boundaries** — No React error boundaries around GraphView or sidebars.
- **Testing suite** — No unit or integration tests.
- **Virtual scrolling** — Collections sidebar and object lists have no virtualization.
- **Windows/Linux parity** — Vibrancy and capture system are macOS-only. File paths and window management need platform abstraction.

---

## Implemented (for reference)

Features that are complete and working as of this writing:

- Persistent SurrealDB at `~/.index/surreal/`
- LIVE SELECT reactivity — DB pushes diffs to renderer, no full reloads
- Async debounced JSON export — `scheduleExport()` everywhere mutations happen
- ID normalization — fully-qualified SurrealDB IDs (`table:id`) throughout
- Domain centralization — system tag registry in `domain/tag-types.js`, exposed via `db:getTagTypes`
- v0.3 → v0.4 migration — one-time import from `~/.index/objects/` JSON on first boot
- Undo system — `UndoToast` + `useHistoryStore` wired to all destructive actions
- Window behavior profiles — Overlay and Window modes in SettingsModal
- Appearance settings — light/dark theme + HSLA background controls
- Cmd+I capture — Safari + generic default handler, deduplication by URI
