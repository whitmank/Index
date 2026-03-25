---
session: 005
session_timestamp: 2026-03-21T20:56:39Z
transcript: transcript.md
authored_by: Claude Sonnet 4.6
---

# Session 005 — Log

## Contradictions surfaced

**Environment drift between workspace versions was silent.**
`/usr/local/bin/index` was hardcoded to the 0.4 workspace path. Running `index` from the
shell launched a different codebase than `npm run electron:dev` from 0.5. No error, no
warning — just silently different behavior. Discovered when the user noticed the discrepancy.

**SurrealDB rejects combined SET+UNSET in a single UPDATE.**
The container→space migration query (`UPDATE objects SET space = true UNSET container WHERE
container = true`) failed on launch with a parse error. SurrealDB requires these as two
separate statements. The query had presumably never been executed against this DB version.

**ORIENT described ObjectDetailPane as missing — it exists.**
The open contradiction "Object detail view is missing — `onObjectOpen` fires; App.jsx does
nothing with it" was stale. A full ObjectDetailPane (name editing, sources, tag assignment,
information grid) is implemented and wired to single-click selection. The ORIENT was not
updated after it was built.

---

## Contradictions resolved

**Environment drift** — `/usr/local/bin/index` updated to point to 0.5. Single source of
truth restored.

**SurrealDB migration** — split into two sequential queries:
`UPDATE objects SET space = true WHERE container = true` followed by
`UPDATE objects UNSET container WHERE container = true`. Both idempotent.

**ObjectDetailPane status** — contradiction retired from ORIENT. The pane is built and wired.
The remaining gap is narrower: double-click on a leaf object opens its source URI rather than
a dedicated in-app view. That is a distinct and smaller open item.

**Calendar view in the interface** — resolved by removal. CalendarView and DayView archived
to `src/components/_archive/`. The calendar button removed from the view switcher. Store
state retained; no data model impact. The view was present but not under active development
and introduced interface complexity without use.

---

## Open contradictions

- **Graph is nodes-only.** Edge data exists and is live via LIVE SELECT; GraphView renders no
  edges. Model and visualization remain misaligned.

- **Object double-click has no in-app destination.** Single-click opens the detail pane.
  Double-click on a leaf object opens its source URI externally. There is no full in-app
  object view. This is the narrowed form of the prior "detail view missing" contradiction.

- **`medium` auto-assignment is dormant.** Tag type registered and seeded; no capture handler
  assigns it.

- **Undo is in archive.** `useHistoryStore` + `UndoToast` complete but unwired. Destructive
  actions remain irreversible in the UI.

- **Capture is Safari-only in practice.** `defaultHandler` fires for other apps but produces
  no output.

- **System space IDs changed.** `objects:root` → `objects:⟨~⟩` and `objects:all` →
  `objects:⟨/⟩` per connection.js migrations. ORIENT and downstream references need to
  reflect the new canonical IDs.

---

## Current synthesis

Session 005 was the first active feature development session on v0.5. Work fell into two
categories: infrastructure repair and UI additions.

**Infrastructure repairs (pre-existing silent failures):**
- PATH script pointed to wrong workspace version
- DB migration syntax invalid for current SurrealDB version
- Hotkey bindings reorganized: CMD+\` now toggles the main app window; quick-window unbound

**UI additions to the list view:**
- Sort by creation date (ascending/descending toggle in list header)
- Source reordering via drag handle in ObjectDetailPane; top source = primary
- Selected row highlight restored for space rows (`.is-space.selected` was using pale
  lavender; hover was overriding the selection background)

**Scope reduction:**
- Calendar view removed from the interface and archived. The two-view model (list, graph) is
  the active surface going forward.

The list view has also been significantly redesigned by the user between sessions (grid
column layout, column dividers, circle type indicators) — a visual direction that is now the
established baseline.
