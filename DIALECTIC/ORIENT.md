---
updated: 2026-03-21
session: "009"
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
edges, root objects, active space objects, nav history, active view.

**Built and working:**
- Object CRUD, tag system with typed edges, space creation/evaluation
- Cmd+I capture (Safari + generic handler), deduplication by URI
- LIVE SELECT reactivity on all 6 tables
- Address bar (CMD+L), command palette (CMD+K), navigation history
- CMD+\` toggles main app window; two window profiles (overlay/window)
- Appearance customization, device identity, migration chain through v0.4
- Async debounced JSON export
- ObjectDetailPane — name editing, sources (drag-to-reorder, primary = index 0), tag
  assignment, information grid; opens on single-click selection in list view
- List view sort by creation date (ascending/descending toggle)
- List view: grid column layout with circle type indicators, continuous column dividers, bottom cap line, alphabetical sort
- ObjectDetailPane: pin button (◈) to toggle object containment in `~`; system objects hidden from pin/dates
- `escId()` utility in `surreal-utils.js` for safe raw SurrealQL interpolation of special-character IDs
- Hotkeys: `cmd+shift+space` toggle window; `cmd+/` navigate to `/`; `cmd+\`` navigate to `~`

**Not built (active backlog):**
- Object full/dedicated view — double-click opens source URI externally; no in-app object view
- Graph edge rendering (nodes only; edge data exists and is live)
- Undo system (`useHistoryStore` + `UndoToast` in `_archive/`, not wired)
- Manual pin affordance — pin button in detail pane implemented; no affordance outside detail pane
- Multi-browser capture (Safari + default; Chrome/Arc/Firefox fall through)
- `medium` tag type defined but never auto-assigned at capture time
- `display: false` tags appear in CreateSpaceModal tag pool (should be filtered)

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

---

## Open Contradictions

- **Graph is nodes-only.** The data model is explicitly graph-first (RELATE edges, membership
  formula, typed relationships). GraphView renders labeled circles with no edges. The
  visualization does not reflect the model.

- **Object double-click has no in-app destination.** Single-click opens the detail pane.
  Double-click on a leaf opens its source URI externally. There is no dedicated full object
  view within the app.

- **`medium` auto-assignment is dormant.** The tag type is registered, seeded, and
  documented. No capture handler derives or assigns it. `kind` tags are applied; `medium`
  tags never appear unless manually created.

- **Undo is in archive.** `useHistoryStore` and `UndoToast` were built, are complete, and
  are not wired. Destructive actions (delete, unpin) are irreversible in the current UI.

- **Capture is Safari-only in practice.** The `defaultHandler` fires for non-Safari apps
  but produces no output. Chrome, Arc, Firefox, and Finder users get a focused Index window
  with nothing captured.
